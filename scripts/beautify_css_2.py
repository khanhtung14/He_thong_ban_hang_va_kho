import os

filepath = "frontend/src/features/roles/RoleWorkspace.css"

admin_css = """
/* Admin Overrides */
.role-workspace.is-admin { background: #f0f4f8; }
.is-admin .workspace-sidebar { inset: 80px auto 24px 24px; height: calc(100vh - 104px); border-radius: var(--radius-2xl); box-shadow: var(--shadow-md); border: none; }
.is-admin .workspace-topbar { background: transparent; backdrop-filter: blur(8px); border-bottom: none; }
.is-admin .workspace-main-column { margin-left: 284px; padding-top: 16px; width: calc(100% - 284px); }
.is-admin .workspace-content { background: #ffffff; border-radius: var(--radius-2xl); box-shadow: var(--shadow-sm); margin: 0 24px 24px 0; padding: 32px; min-height: calc(100vh - 120px); }

/* Tables specifics for admin */
.is-admin .workspace-table th { font-size: 11px; }
.is-admin .workspace-table td { font-size: 12px; }

/* Modal admin overrides */
.workspace-edit-user-form { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.workspace-edit-user-form .workspace-modal-actions { grid-column: 1 / -1; margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border-subtle); display: flex; justify-content: flex-end; gap: 12px; }
.workspace-assignment-group { grid-column: 1 / -1; border: 1px solid var(--border-strong); border-radius: var(--radius-lg); padding: 16px; cursor: pointer; transition: all var(--transition-fast); }
.workspace-assignment-group:hover { border-color: var(--accent-primary); }
.workspace-assignment-trigger { width: 100%; text-align: left; font-size: 14px; font-weight: 600; color: var(--text-primary); border: none; background: transparent; padding: 0; cursor: pointer; }
.workspace-assignment-trigger::after { content: " ⌄"; float: right; }
.workspace-assignment-trigger[aria-expanded="true"]::after { content: " ⌃"; }
.workspace-assignment-summary { margin-top: 8px; color: var(--text-secondary); font-size: 13px; }
.workspace-assignment-options { display: none; padding-top: 16px; margin-top: 16px; border-top: 1px dashed var(--border-subtle); }
.workspace-assignment-group.is-open .workspace-assignment-options { display: grid; gap: 12px; }
.workspace-check-option { display: flex; align-items: center; gap: 12px; cursor: pointer; color: var(--text-secondary); font-size: 14px; }
.workspace-check-option:hover { color: var(--text-primary); }
.workspace-check-option input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--accent-primary); cursor: pointer; }

/* Fix missing legacy classes */
.workspace-audit-summary > div { padding: 12px 0; border-bottom: 1px solid var(--border-subtle); display: flex; gap: 12px; align-items: flex-start; }
.workspace-audit-summary strong { display: block; font-size: 13px; color: var(--text-primary); margin-bottom: 4px; }
.workspace-audit-summary small { font-size: 11px; color: var(--text-tertiary); }
.workspace-role-summary > div { padding: 12px 0; display: flex; gap: 12px; align-items: center; }
.workspace-role-mark { width: 32px; height: 32px; border-radius: var(--radius-md); display: grid; place-items: center; background: var(--accent-light); color: var(--accent-primary); font-weight: bold; }
.workspace-role-summary strong { display: block; font-size: 13px; color: var(--text-primary); margin-bottom: 2px; }
.workspace-role-summary small { font-size: 11px; color: var(--text-tertiary); }
.workspace-configuration-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
.workspace-configuration-grid article { padding: 20px; border: 1px solid var(--border-subtle); border-radius: var(--radius-xl); background: var(--bg-surface); }
.workspace-configuration-grid article > span { font-size: 24px; color: var(--accent-primary); margin-bottom: 12px; display: block; }
.workspace-configuration-grid strong { font-size: 15px; color: var(--text-primary); display: block; margin-bottom: 8px; }
.workspace-configuration-grid p { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin: 0; }
"""

with open(filepath, 'a', encoding='utf-8') as f:
    f.write(admin_css)
