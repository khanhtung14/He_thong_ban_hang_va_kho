/**
 * MODULE CHUYỂN ĐỔI SỐ THÀNH CHỮ TIẾNG VIỆT CHUẨN NGÂN HÀNG & KẾ TOÁN DOANH NGHIỆP
 * Hệ thống Quản lý Bán hàng & Phân phối Doanh nghiệp NEXUS OMS (SCRUM-86 / SCRUM-15)
 */

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const SCALES = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

function readGroupOfThree(group, isFirstGroup) {
  const hundreds = Math.floor(group / 100);
  const remainder = group % 100;
  const tens = Math.floor(remainder / 10);
  const units = remainder % 10;
  let result = '';

  if (hundreds > 0 || !isFirstGroup) {
    result += DIGITS[hundreds] + ' trăm ';
  }

  if (tens > 1) {
    result += DIGITS[tens] + ' mươi ';
    if (units === 1) result += 'mốt ';
    else if (units === 5) result += 'lăm ';
    else if (units > 0) result += DIGITS[units] + ' ';
  } else if (tens === 1) {
    result += 'mười ';
    if (units === 5) result += 'lăm ';
    else if (units > 0) result += DIGITS[units] + ' ';
  } else if (tens === 0 && units > 0) {
    if (hundreds > 0 || !isFirstGroup) {
      result += 'lẻ ' + DIGITS[units] + ' ';
    } else {
      result += DIGITS[units] + ' ';
    }
  }

  return result.trim();
}

/**
 * Chuyển đổi số nguyên tiền tệ (VND) sang chuỗi chữ tiếng Việt trang trọng
 * @param {number|string} amount 
 * @returns {string} Ví dụ: "Bốn mươi lăm triệu sáu trăm nghìn đồng chẵn."
 */
export function convertNumberToWords(amount) {
  const num = Math.round(Number(amount));
  if (isNaN(num) || num === 0) return 'Không đồng chẵn.';
  if (num < 0) return 'Âm ' + convertNumberToWords(Math.abs(num));

  let str = num.toString();
  const groups = [];

  while (str.length > 0) {
    const chunk = str.slice(Math.max(0, str.length - 3));
    groups.push(parseInt(chunk, 10));
    str = str.slice(0, Math.max(0, str.length - 3));
  }

  let words = '';
  for (let i = groups.length - 1; i >= 0; i--) {
    const groupVal = groups[i];
    if (groupVal > 0) {
      const isFirst = (i === groups.length - 1);
      const groupText = readGroupOfThree(groupVal, isFirst);
      words += groupText + ' ' + SCALES[i] + ' ';
    }
  }

  words = words.trim();
  // Viết hoa chữ cái đầu tiên
  words = words.charAt(0).toUpperCase() + words.slice(1);
  return `${words} đồng chẵn.`;
}

/**
 * Định dạng số tiền sang chuẩn hiển thị tiền tệ Việt Nam (VND)
 * @param {number} amount 
 * @returns {string} Ví dụ: "45.650.000 đ"
 */
export function formatCurrency(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return '0 đ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + ' đ';
}
