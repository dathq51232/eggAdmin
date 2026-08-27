export const numberFormat = new Intl.NumberFormat("vi-VN");
export const dateFormat = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

export const dateTimeFormat = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

export const receiptTypeLabels = {
  FARM_RECEIPT: "Nhập chăn nuôi",
  TFP_RECEIPT: "Nhập TFP",
  WAREHOUSE_REQUEST: "Yêu cầu nhập kho",
} as const;

export const receiptStatusLabels = {
  DRAFT: "Nháp",
  PENDING_QC: "Chờ QC",
  PENDING_WAREHOUSE: "Chờ thủ kho",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Từ chối",
} as const;

export const inventoryTypeLabels = {
  RECEIPT: "Nhập",
  ISSUE: "Xuất",
  BREAKAGE: "Bể/loại bỏ",
  ADJUSTMENT: "Điều chỉnh tăng",
  OPENING: "Đầu kỳ",
} as const;

export function vietnamToday() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
}
