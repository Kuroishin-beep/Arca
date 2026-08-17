# Application State

| Data                  | Shape (rough)                                            | Who owns it      | Changes when...                                                                           |
| --------------------- | -------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| `user`                | `{ id, displayName, role }` — role is `'gm' \| 'player'` | App              | User logs in or out                                                                       |
| `containers`          | `[{ id, name, type, ownerId }]`                          | Workspace        | A container is created, renamed, or deleted — or a sync update arrives                    |
| `selectedContainerId` | `string \| null`                                         | Workspace        | User clicks a container in the Side Bar (`onItemSelect`)                                  |
| `items`               | `[{ id, containerId, name, qty, weight, notes }]`        | Workspace        | An item is added, edited, deleted, or moved between containers — or a sync update arrives |
| `searchQuery`         | `string`                                                 | Workspace        | User types in the Search Field                                                            |
| `sort`                | `{ column, direction }`                                  | Table            | User clicks a column header                                                               |
| `isSidebarCollapsed`  | `boolean`                                                | Workspace        | User clicks collapse (`onToggleCollapse`)                                                 |
| `comments`            | `[{ id, author, content, createdAt, parentId }]`         | `CommentSection` | Someone posts or deletes a comment                                                        |
| `syncStatus`          | `'idle' \| 'syncing' \| 'error'`                         | App              | A sync request starts, succeeds, or fails                                                 |
