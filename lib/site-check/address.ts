/** The longest address the quick check accepts. */
export const ADDRESS_MAX = 2000;

export type ParsedAddress = { ok: true; url: string } | { ok: false };

/**
 * What was typed into "Their website", made into an address the auditor can load. A bare host
 * (`theirbusiness.com`) gets `https://`. Only http and https are accepted, an address with a user
 * name or password in it is refused, and so is anything longer than ADDRESS_MAX or that is not a
 * web address at all. Whether the host is a private address is the fetcher's call, after DNS.
 */
export function parseProspectAddress(raw: string): ParsedAddress {
  const text = raw.trim();
  if (text === "" || text.length > ADDRESS_MAX) return { ok: false };

  // "ftp://x" names a scheme and is judged as written; "example.com" and "localhost:3000" do not.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false };
  if (url.username !== "" || url.password !== "") return { ok: false };
  return { ok: true, url: url.toString() };
}
