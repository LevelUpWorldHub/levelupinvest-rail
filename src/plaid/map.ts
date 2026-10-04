import type { AccountType, Category, Frequency } from "../types.js";

export function toCents(dollars: number | null | undefined): number {
  return dollars == null ? 0 : Math.round(dollars * 100);
}

export function mapAccountType(t: string | undefined): AccountType {
  switch (t) {
    case "depository":
    case "credit":
    case "loan":
    case "investment":
      return t;
    default:
      return "other";
  }
}

/**
 * Plaid personal_finance_category -> our categories. Anything not listed is 'other'.
 * Known limitation: movements between a user's own accounts are not special-cased.
 */
export function mapCategory(primary: string | undefined, detailed: string | undefined): Category {
  switch (primary) {
    case "INCOME":
      return "income";
    case "RENT_AND_UTILITIES":
      return detailed === "RENT_AND_UTILITIES_RENT" ? "housing" : "utilities";
    case "HOME_IMPROVEMENT":
      return "housing";
    case "FOOD_AND_DRINK":
      return detailed === "FOOD_AND_DRINK_GROCERIES" ? "groceries" : "dining";
    case "TRANSPORTATION":
      return "transportation";
    case "TRAVEL":
      return "travel";
    case "ENTERTAINMENT":
      return "entertainment";
    case "GENERAL_MERCHANDISE":
      return "shopping";
    case "MEDICAL":
    case "PERSONAL_CARE":
      return "health";
    case "BANK_FEES":
      return "fees";
    default:
      return "other";
  }
}

export function mapFrequency(f: string | undefined): Frequency {
  switch (f) {
    case "WEEKLY":
      return "weekly";
    case "BIWEEKLY":
      return "biweekly";
    case "SEMI_MONTHLY":
      return "semi_monthly";
    case "MONTHLY":
      return "monthly";
    case "ANNUALLY":
      return "annually";
    default:
      return "unknown";
  }
}
