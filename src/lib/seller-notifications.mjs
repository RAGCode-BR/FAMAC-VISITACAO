// Só uma nova atribuição (inclusive uma reabertura) gera aviso.
export function sellerAssignments(before, after) {
  return after.opportunities.filter((item) => {
    const previous = before.opportunities.find((row) => row.id === item.id);
    return !item.deleted && !!item.responsibleId &&
      (!previous || previous.deleted || previous.responsibleId !== item.responsibleId);
  });
}
