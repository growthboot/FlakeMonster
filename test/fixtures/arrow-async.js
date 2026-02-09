const fetchItems = async () => {
  const items = await getItems();
  const filtered = items.filter(i => i.active);
  return filtered;
};
// Expression body arrow — should be skipped (no block to inject into)
const quickFetch = async id => fetch(`/items/${id}`);
export {fetchItems, quickFetch};
