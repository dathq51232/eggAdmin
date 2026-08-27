export const EGGS_PER_TREE = 300;

export function asNonNegativeInt(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0 || !Number.isInteger(number)) {
    throw new Error("Số lượng phải là số nguyên không âm.");
  }
  return number;
}

export function calculateLineTotal({
  trees = 0,
  eggsPerTree = EGGS_PER_TREE,
  looseEggs = 0,
  machineEggs = 0,
  a5Eggs = 0,
  dirtyEggs = 0,
}) {
  return (
    asNonNegativeInt(trees) * asNonNegativeInt(eggsPerTree) +
    asNonNegativeInt(looseEggs) +
    asNonNegativeInt(machineEggs) +
    asNonNegativeInt(a5Eggs) +
    asNonNegativeInt(dirtyEggs)
  );
}

export function signedInventoryQuantity(type, quantity) {
  const amount = asNonNegativeInt(quantity);
  if (amount === 0) throw new Error("Số lượng phải lớn hơn 0.");
  return type === "ISSUE" || type === "BREAKAGE" ? -amount : amount;
}

export function canTransition(status, action, role) {
  if (role === "ADMIN") {
    return (
      (status === "PENDING_QC" && ["VERIFY", "REJECT"].includes(action)) ||
      (status === "PENDING_WAREHOUSE" && ["APPROVE", "REJECT"].includes(action))
    );
  }
  if (role === "QC") {
    return status === "PENDING_QC" && ["VERIFY", "REJECT"].includes(action);
  }
  if (role === "WAREHOUSE") {
    return status === "PENDING_WAREHOUSE" && ["APPROVE", "REJECT"].includes(action);
  }
  return false;
}
