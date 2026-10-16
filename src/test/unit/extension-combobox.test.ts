import { describe, expect, it } from "vitest";
import type { ApplicationProfile } from "@/modules/apply/types";
import { defaultApplicationProfile } from "@/modules/apply/profile";
import {
  bestComboboxOption,
  canActivateLabel,
  runComboboxFill,
  workIntentQueries,
  type ComboboxSession,
} from "@/modules/extension/combobox";

const profile: ApplicationProfile = {
  ...defaultApplicationProfile(),
  legalName: "Ada Lovelace",
  city: "Toronto",
  province: "ON",
  workAuthorization: "Canadian citizen",
  requiresSponsorship: false,
  willingToRelocate: false,
};

describe("combobox option matching", () => {
  it("picks Canada over another +1 country", () => {
    const picked = bestComboboxOption(
      ["United States (+1)", "Canada (+1)", "Cayman Islands (+1)"],
      ["Canada", "Canada +1"],
      "phoneCountry"
    );
    expect(picked?.option).toBe("Canada (+1)");
  });

  it("prefers remote Canada, then hybrid Toronto, and rejects US-only lists", () => {
    const queries = workIntentQueries(profile);
    expect(queries[0]).toBe("Remote, Canada");
    expect(queries).toContain("Hybrid, Toronto / GTA");
    expect(queries).toContain("Canadian citizen");

    const picked = bestComboboxOption(
      ["Remote - United States", "San Francisco, CA", "Hybrid - Toronto / GTA", "Remote - Canada"],
      queries,
      "workIntent"
    );
    expect(picked?.option).toBe("Remote - Canada");

    const hybridOnly = bestComboboxOption(
      ["San Francisco, CA", "Hybrid - Toronto / GTA"],
      queries,
      "workIntent"
    );
    expect(hybridOnly?.option).toBe("Hybrid - Toronto / GTA");

    expect(
      bestComboboxOption(["San Francisco, CA", "New York, NY", "Remote - United States"], queries, "workIntent")
    ).toBeNull();
  });

  it("matches a city option only when the province agrees", () => {
    const picked = bestComboboxOption(
      ["Toronto, Ohio, United States", "Toronto, Ontario, Canada"],
      ["Toronto, Ontario", "Toronto"],
      "place"
    );
    expect(picked?.option).toBe("Toronto, Ontario, Canada");
  });

  it("refuses to activate submit, apply, and next controls", () => {
    expect(canActivateLabel("Submit application", "submit")).toBe(false);
    expect(canActivateLabel("Apply now", "button")).toBe(false);
    expect(canActivateLabel("Save and Continue", "button")).toBe(false);
    expect(canActivateLabel("Next", "button")).toBe(false);
    expect(canActivateLabel("Canada (+1)", null)).toBe(true);
    expect(canActivateLabel("Toggle flyout", "button")).toBe(true);
  });
});

describe("combobox fill sequence", () => {
  function session(catalog: string[]) {
    let open = false;
    let query = "";
    let selected = "";
    let dismissed = 0;
    const chosen: string[] = [];
    const fake: ComboboxSession = {
      selected: () => selected,
      focus() {},
      open() {
        open = true;
      },
      setQuery(value: string) {
        query = value;
      },
      readOptions() {
        if (!open || !query) return [];
        const needle = query.toLowerCase().split(",")[0]?.trim() ?? "";
        return catalog.filter((option) => option.toLowerCase().includes(needle.slice(0, 6)));
      },
      choose(option: string) {
        chosen.push(option);
        selected = option;
        open = false;
        return true;
      },
      dismiss() {
        dismissed += 1;
        open = false;
        query = "";
        selected = "";
      },
    };
    return { fake, chosen, dismissals: () => dismissed };
  }

  it("types a filter, waits for options, chooses Canada, and verifies it", async () => {
    const { fake, chosen } = session(["United States (+1)", "Canada (+1)", "Cayman Islands (+1)"]);
    const result = await runComboboxFill(
      fake,
      { value: "Canada", queries: ["Canada", "Canada +1"], match: "phoneCountry" },
      async () => {},
      { timeoutMs: 0, verifyMs: 0 }
    );
    expect(result).toEqual({ ok: true, value: "Canada (+1)" });
    expect(chosen).toEqual(["Canada (+1)"]);
  });

  it("does not choose a US option and clears the control when nothing matches", async () => {
    const { fake, chosen, dismissals } = session(["San Francisco, CA", "Remote - United States"]);
    const result = await runComboboxFill(
      fake,
      { value: "Remote, Canada", queries: workIntentQueries(profile), match: "workIntent" },
      async () => {},
      { timeoutMs: 0, verifyMs: 0 }
    );
    expect(result.ok).toBe(false);
    expect(chosen).toEqual([]);
    expect(dismissals()).toBeGreaterThan(0);
    expect(fake.selected()).toBe("");
  });
});
