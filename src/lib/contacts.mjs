export const isSharedContact = (contact) =>
  ["architect", "contractor"].includes(contact?.role);

export const contactPhones = (contact) => {
  const seen = new Set();
  return [contact.phone, contact.phone2].filter((phone) => {
    if (typeof phone !== "string") return false;
    const digits = phone.replace(/\D/g, "");
    if (!digits || seen.has(digits)) return false;
    seen.add(digits);
    return true;
  });
};
