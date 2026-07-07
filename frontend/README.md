# DFHome Frontend

React + Vite + TypeScript SPA for DFHome.

UI is built with shadcn UI and Tailwind CSS. Use `pnpm` for all frontend
commands.

## Adding components

Use the `user-shadcn` MCP server to find components and get the add command,
then run it via `pnpm dlx` from this directory:

```bash
pnpm dlx shadcn@latest add @shadcn/button --yes
```

This will place the ui components in the `src/components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button"
```
