export const canAccessServices = (member) => Boolean(member && (
  member.role === "admin" || member.role === "supervisor" && member.teamId === "tulio"
));
