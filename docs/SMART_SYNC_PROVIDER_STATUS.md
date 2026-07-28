# Smart Sync provider status

| Source | Web worker | Incremental cursor | User action |
| --- | --- | --- | --- |
| Google Drive | Ready | Drive Changes token | Connect and approve plan |
| Dropbox | Ready | `list_folder` cursor | Add OAuth credentials, connect, approve plan |
| Microsoft OneDrive | Ready | Graph delta link | Add OAuth credentials, connect, approve plan |
| Google Photos | Ready for selected imports | Picker session | Add OAuth credentials, connect, explicitly select items |
| iPhone/iPad Photos | Native client required | Native checkpoint | Install signed mobile app and approve Photos access |
| Android Photos & Videos | Native client required | Native checkpoint | Install signed mobile app and approve media access |

“Ready” means the application code and worker are implemented. A third-party source cannot connect until that provider’s client ID, client secret, and callback URL are configured in its developer console and in Vercel.
