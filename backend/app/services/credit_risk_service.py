"""Automated Credit Risk Evaluation Service (SCRUM-42).

Authoritative service responsible for:
1. Evaluating dealer credit risk: monetary credit limit vs debt exposure, overdue invoice aging vs allowed days.
2. Managing automatic risk flag transitions and sales restrictions (BLOCK vs REVIEW).
3. Preserving manual administrative lock decisions (SCRUM-85) independently of automated evaluations.
4. Enabling payment-triggered re-evaluation and daily scheduled re-evaluation.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.models import Customer, CustomerDebt, Invoice, InvoicePayment

logger = logging.getLogger("credit_risk_service")


@dataclass
class InvoiceDebtDetail:
    invoice_id: int
    invoice_date: Optional[date]
    payment_term_days: int
    due_date: date
    total_amount: float
    paid_amount: float
    remaining_amount: float
    overdue_days: int
    is_overdue: bool
    is_violating: bool


@dataclass
class CreditRiskEvaluationResult:
    customer_id: int
    customer_code: str
    customer_name: str
    credit_limit: float
    current_debt: float
    effective_exposure: float
    is_limit_exceeded: bool
    exceeded_amount: float
    max_overdue_days: int
    permitted_overdue_days: int
    is_overdue_exceeded: bool
    violating_invoices_count: int
    is_flagged: bool
    breach_reasons: List[str] = field(default_factory=list)
    breach_summary: Optional[str] = None
    action_mode: str = "BLOCK"  # "BLOCK" or "REVIEW"
    is_locked: bool = False
    is_manually_locked: bool = False
    evaluated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "customerId": self.customer_id,
            "customerCode": self.customer_code,
            "customerName": self.customer_name,
            "creditLimit": self.credit_limit,
            "currentDebt": self.current_debt,
            "effectiveExposure": self.effective_exposure,
            "isLimitExceeded": self.is_limit_exceeded,
            "exceededAmount": self.exceeded_amount,
            "maxOverdueDays": self.max_overdue_days,
            "permittedOverdueDays": self.permitted_overdue_days,
            "isOverdueExceeded": self.is_overdue_exceeded,
            "violatingInvoicesCount": self.violating_invoices_count,
            "isFlagged": self.is_flagged,
            "isCreditFlagged": self.is_flagged,
            "breachReasons": self.breach_reasons,
            "breachSummary": self.breach_summary,
            "creditFlagReason": self.breach_summary,
            "actionMode": self.action_mode,
            "creditActionMode": self.action_mode,
            "isLocked": self.is_locked,
            "isManuallyLocked": self.is_manually_locked,
            "evaluatedAt": self.evaluated_at.isoformat(),
        }


class CreditRiskService:
    """Core domain service for credit risk evaluation."""

    @staticmethod
    def get_invoice_debt_details(
        db: Session,
        customer_id: int,
        permitted_overdue_days: int,
        eval_date: Optional[date] = None,
    ) -> List[InvoiceDebtDetail]:
        """Calculates outstanding amounts and overdue days for all non-paid invoices of a customer."""
        today = eval_date or date.today()
        invoices = (
            db.query(Invoice)
            .filter(Invoice.customer_id == customer_id, Invoice.status != "PAID")
            .all()
        )

        details: List[InvoiceDebtDetail] = []
        for inv in invoices:
            payments = (
                db.query(InvoicePayment)
                .filter(InvoicePayment.invoice_id == inv.id)
                .all()
            )
            paid_amount = sum(float(p.amount_applied or 0.0) for p in payments)
            total_amount = float(inv.total_amount or 0.0)
            remaining_amount = max(0.0, total_amount - paid_amount)

            if remaining_amount <= 0.0:
                # Invoice is effectively fully settled
                inv.status = "PAID"
                continue

            inv_date = inv.invoice_date.date() if inv.invoice_date else today
            term_days = max(0, int(inv.payment_term_days or 0))
            due_date = inv_date + timedelta(days=term_days)

            overdue_days = max(0, (today - due_date).days) if today > due_date else 0
            is_overdue = overdue_days > 0
            is_violating = overdue_days > permitted_overdue_days

            details.append(
                InvoiceDebtDetail(
                    invoice_id=inv.id,
                    invoice_date=inv_date,
                    payment_term_days=term_days,
                    due_date=due_date,
                    total_amount=total_amount,
                    paid_amount=paid_amount,
                    remaining_amount=remaining_amount,
                    overdue_days=overdue_days,
                    is_overdue=is_overdue,
                    is_violating=is_violating,
                )
            )

        return details

    @classmethod
    def evaluate_dealer_credit_risk(
        cls,
        db: Session,
        customer: Customer,
        eval_date: Optional[date] = None,
    ) -> CreditRiskEvaluationResult:
        """Evaluates whether a dealer breaches monetary credit limit or permitted overdue days."""
        today = eval_date or date.today()
        permitted_overdue_days = int(
            getattr(customer, "max_debt_days", None)
            or getattr(customer, "max_due_days", None)
            or 30
        )
        credit_limit = float(getattr(customer, "credit_limit", 0.0) or 0.0)

        # 1. Inspect invoices and calculate overdue & total outstanding debt
        invoice_details = cls.get_invoice_debt_details(
            db, customer.id, permitted_overdue_days, eval_date=today
        )
        unpaid_invoices_sum = sum(inv.remaining_amount for inv in invoice_details)

        # 2. Reconcile with Customer.current_debt and CustomerDebt table
        current_debt = float(getattr(customer, "current_debt", 0.0) or 0.0)
        debt_record = (
            db.query(CustomerDebt)
            .filter(CustomerDebt.customer_id == customer.id)
            .first()
        )
        if debt_record:
            current_debt = max(current_debt, float(debt_record.total_debt or 0.0))

        # Effective financial exposure
        effective_exposure = max(current_debt, unpaid_invoices_sum)

        # 3. Check monetary credit limit breach
        is_limit_exceeded = False
        exceeded_amount = 0.0
        if credit_limit > 0 and effective_exposure > credit_limit:
            is_limit_exceeded = True
            exceeded_amount = effective_exposure - credit_limit
        elif credit_limit == 0.0 and effective_exposure > 0.0:
            is_limit_exceeded = True
            exceeded_amount = effective_exposure

        # 4. Check overdue days breach
        violating_invoices = [inv for inv in invoice_details if inv.is_violating]
        is_overdue_exceeded = len(violating_invoices) > 0
        max_overdue_days = max(
            [inv.overdue_days for inv in invoice_details], default=0
        )

        # 5. Determine flag state & build explainable breach reasons
        is_flagged = is_limit_exceeded or is_overdue_exceeded
        breach_reasons: List[str] = []

        if is_limit_exceeded:
            breach_reasons.append(
                f"Vượt hạn mức tín dụng cho phép (Dư nợ: {effective_exposure:,.0f} ₫ / Hạn mức: {credit_limit:,.0f} ₫, vượt {exceeded_amount:,.0f} ₫)"
            )
        if is_overdue_exceeded:
            breach_reasons.append(
                f"Có {len(violating_invoices)} hóa đơn nợ quá hạn lên đến {max_overdue_days} ngày (vượt quá {permitted_overdue_days} ngày cho phép)"
            )

        breach_summary = "; ".join(breach_reasons) if breach_reasons else None
        action_mode = (
            getattr(customer, "credit_action_mode", "BLOCK") or "BLOCK"
        ).upper()

        return CreditRiskEvaluationResult(
            customer_id=customer.id,
            customer_code=customer.code,
            customer_name=customer.name,
            credit_limit=credit_limit,
            current_debt=current_debt,
            effective_exposure=effective_exposure,
            is_limit_exceeded=is_limit_exceeded,
            exceeded_amount=exceeded_amount,
            max_overdue_days=max_overdue_days,
            permitted_overdue_days=permitted_overdue_days,
            is_overdue_exceeded=is_overdue_exceeded,
            violating_invoices_count=len(violating_invoices),
            is_flagged=is_flagged,
            breach_reasons=breach_reasons,
            breach_summary=breach_summary,
            action_mode=action_mode,
            is_locked=customer.is_locked,
            is_manually_locked=bool(getattr(customer, "is_manually_locked", False)),
            evaluated_at=datetime.now(timezone.utc),
        )

    @classmethod
    def apply_evaluation(
        cls,
        db: Session,
        customer: Customer,
        eval_date: Optional[date] = None,
        commit: bool = True,
    ) -> CreditRiskEvaluationResult:
        """Evaluates credit risk and persists state transitions safely."""
        eval_result = cls.evaluate_dealer_credit_risk(db, customer, eval_date=eval_date)

        # Update risk flag attributes on Customer
        customer.is_credit_flagged = eval_result.is_flagged
        customer.credit_flag_reason = eval_result.breach_summary
        customer.credit_flagged_at = (
            eval_result.evaluated_at if eval_result.is_flagged else None
        )

        is_manual_lock = bool(
            getattr(customer, "is_manually_locked", False)
            or (customer.locked_by_id is not None)
        )

        if eval_result.is_flagged:
            if eval_result.action_mode == "BLOCK":
                # In BLOCK mode, ensure sales restriction is enforced
                customer.is_locked = True
                if not customer.lock_reason:
                    customer.lock_reason = (
                        f"Tự động khóa bán (Rủi ro công nợ): {eval_result.breach_summary}"
                    )
                if not customer.locked_at:
                    customer.locked_at = eval_result.evaluated_at
            elif eval_result.action_mode == "REVIEW":
                # In REVIEW mode, if not manually locked, do not hard-lock customer
                # so that orders can proceed into review (PENDING_APPROVAL) workflow
                if not is_manual_lock:
                    customer.is_locked = False
                    if customer.lock_reason and "Tự động khóa bán" in customer.lock_reason:
                        customer.lock_reason = None
        else:
            # Not flagged: Financial recovery!
            # Safely clear automated restriction ONLY if not manually locked
            if not is_manual_lock:
                customer.is_locked = False
                customer.lock_reason = None
                customer.locked_at = None
                customer.locked_by_id = None

        eval_result.is_locked = customer.is_locked
        eval_result.is_manually_locked = is_manual_lock

        if commit:
            db.commit()
            db.refresh(customer)

        return eval_result

    @classmethod
    def reevaluate_all_dealers(
        cls,
        db: Session,
        eval_date: Optional[date] = None,
    ) -> Dict[str, Any]:
        """Evaluates all active dealers once. Used by the daily scheduled job."""
        customers = (
            db.query(Customer)
            .filter(Customer.is_active == True)
            .order_by(Customer.id.asc())
            .all()
        )

        total = len(customers)
        flagged_count = 0
        cleared_count = 0
        errors: List[Dict[str, Any]] = []
        details: List[Dict[str, Any]] = []

        for cust in customers:
            try:
                result = cls.apply_evaluation(db, cust, eval_date=eval_date, commit=True)
                if result.is_flagged:
                    flagged_count += 1
                else:
                    cleared_count += 1
                details.append({
                    "customerId": cust.id,
                    "code": cust.code,
                    "name": cust.name,
                    "isFlagged": result.is_flagged,
                    "isLocked": cust.is_locked,
                    "action": result.action_mode,
                    "reasons": result.breach_reasons,
                })
            except Exception as e:
                db.rollback()
                logger.error(f"Error evaluating dealer {cust.id} ({cust.code}): {e}")
                errors.append({"customerId": cust.id, "error": str(e)})

        summary = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "totalCustomers": total,
            "flaggedCount": flagged_count,
            "clearedCount": cleared_count,
            "errorCount": len(errors),
            "errors": errors,
            "details": details,
        }
        logger.info(
            f"Daily Credit Risk Evaluation completed: {total} evaluated, "
            f"{flagged_count} flagged, {cleared_count} cleared, {len(errors)} errors."
        )
        return summary


async def daily_credit_risk_scheduler(stop_event: Any):
    """Run the credit risk reevaluation task once per day while the application is alive (SCRUM-42 R3)."""
    import asyncio
    from app.core.database import SessionLocal

    while not stop_event.is_set():
        try:
            with SessionLocal() as db:
                CreditRiskService.reevaluate_all_dealers(db)
        except Exception as e:
            logger.error(f"Error in daily_credit_risk_scheduler execution: {e}")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=86400)
        except asyncio.TimeoutError:
            continue
