# Roles and Permissions

| Role   | Access                                          |
| ------ | ----------------------------------------------- |
| Admin  | Full control (users, posts, roles, comments, developer settings) |
| Author | Create and manage own posts, delete own comments |

Session clients enforce Supabase RLS. Service-role clients bypass RLS and must perform explicit authentication, ownership and role checks. Authors also manage their own developer API and provider keys.
