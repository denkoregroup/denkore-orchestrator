/** @jest-environment node */
import { ADDRESS_MAX, parseProspectAddress } from "../address";

const url = (raw: string) => {
  const result = parseProspectAddress(raw);
  return result.ok ? result.url : null;
};

describe("parseProspectAddress", () => {
  it("adds https:// to a bare host, with or without a path", () => {
    expect(url("theirbusiness.com")).toBe("https://theirbusiness.com/");
    expect(url("www.theirbusiness.com/about")).toBe("https://www.theirbusiness.com/about");
    expect(url("  theirbusiness.com  ")).toBe("https://theirbusiness.com/");
  });

  it("keeps an http or https address as typed", () => {
    expect(url("http://theirbusiness.com")).toBe("http://theirbusiness.com/");
    expect(url("HTTPS://TheirBusiness.com/Shop?a=1")).toBe("https://theirbusiness.com/Shop?a=1");
  });

  it("refuses a scheme that is not http or https", () => {
    for (const raw of ["ftp://theirbusiness.com", "file:///etc/passwd", "gopher://x.com", "data://x"]) expect(url(raw)).toBeNull();
  });

  it("refuses an address with a user name or password in it", () => {
    expect(url("https://user:secret@theirbusiness.com")).toBeNull();
    expect(url("https://user@theirbusiness.com")).toBeNull();
    expect(url("user@theirbusiness.com")).toBeNull(); // a bare "user@host" becomes https://user@host
  });

  it("refuses what is not a web address at all", () => {
    for (const raw of ["", "   ", "javascript:alert(1)", "two words.com", "https://", "mailto:someone@example.com"]) expect(url(raw)).toBeNull();
  });

  it("refuses more than 2,000 characters, and accepts exactly 2,000", () => {
    const path = (length: number) => `theirbusiness.com/${"a".repeat(length - "theirbusiness.com/".length)}`;
    expect(ADDRESS_MAX).toBe(2000);
    expect(url(path(2000))).not.toBeNull();
    expect(url(path(2001))).toBeNull();
  });
});
