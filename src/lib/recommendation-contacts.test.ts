import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getRecommenderContacts } from "./recommendation-contacts";

/**
 * Regression guard for the /recommendation contact reveal: a missing or
 * blank phone env var must never produce a contact object, because the
 * client builds a tel: link from the phone and an undefined value throws
 * mid-render, which previously crashed the whole page.
 */
describe("getRecommenderContacts", () => {
  let originalMallerie: string | undefined;
  let originalDavid: string | undefined;

  beforeEach(() => {
    originalMallerie = process.env.MALLERIE_PHONE;
    originalDavid = process.env.DAVID_PHONE;
  });

  afterEach(() => {
    restoreEnv("MALLERIE_PHONE", originalMallerie);
    restoreEnv("DAVID_PHONE", originalDavid);
  });

  it("returns no contacts when neither phone var is set", () => {
    delete process.env.MALLERIE_PHONE;
    delete process.env.DAVID_PHONE;
    expect(getRecommenderContacts()).toEqual([]);
  });

  it("drops only the entry whose phone var is missing", () => {
    process.env.MALLERIE_PHONE = "(555) 111-2222";
    delete process.env.DAVID_PHONE;

    const contacts = getRecommenderContacts();
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.id).toBe("mallerie");
  });

  it("drops an entry whose phone var is blank or whitespace-only", () => {
    process.env.MALLERIE_PHONE = "   ";
    process.env.DAVID_PHONE = "";
    expect(getRecommenderContacts()).toEqual([]);
  });

  it("returns both contacts with trimmed phones when both vars are set", () => {
    process.env.MALLERIE_PHONE = "  (555) 111-2222  ";
    process.env.DAVID_PHONE = "(555) 333-4444";

    const contacts = getRecommenderContacts();
    expect(contacts).toHaveLength(2);
    expect(contacts.map((c) => c.phone)).toEqual([
      "(555) 111-2222",
      "(555) 333-4444",
    ]);
  });

  it("never yields a contact with an empty or undefined phone", () => {
    process.env.MALLERIE_PHONE = "(555) 111-2222";
    process.env.DAVID_PHONE = "   ";

    for (const contact of getRecommenderContacts()) {
      expect(contact.phone).toBeTruthy();
    }
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
