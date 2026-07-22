export type GraphElement = { id: string; displayName: string };
export type GraphConnection = {
  fromElementId: string;
  toElementId: string;
  isBidirectional: boolean;
  traversable: boolean;
};

export function findPossibleGraphRoutes(
  elements: GraphElement[],
  connections: GraphConnection[],
  fromElementId: string,
  toElementId: string,
  maximumDepth = 8,
) {
  const byId = new Map(elements.map((element) => [element.id, element]));
  if (!byId.has(fromElementId) || !byId.has(toElementId)) return [];
  const adjacency = new Map<string, string[]>();
  const add = (from: string, to: string) =>
    adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
  for (const connection of connections.filter((item) => item.traversable)) {
    add(connection.fromElementId, connection.toElementId);
    if (connection.isBidirectional)
      add(connection.toElementId, connection.fromElementId);
  }
  const queue: string[][] = [[fromElementId]];
  const routes: string[][] = [];
  while (queue.length > 0 && routes.length < 20) {
    const path = queue.shift();
    if (!path || path.length - 1 > maximumDepth) continue;
    const current = path.at(-1);
    if (!current) continue;
    if (current === toElementId) {
      routes.push(path.map((id) => byId.get(id)?.displayName ?? id));
      continue;
    }
    for (const next of adjacency.get(current) ?? []) {
      if (!path.includes(next)) queue.push([...path, next]);
    }
  }
  return routes;
}
