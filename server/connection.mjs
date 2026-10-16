export function connectionString(value) {
  const url = new URL(value);
  url.searchParams.set("sslmode", "verify-full");
  return url.href;
}
