import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import './styles/index.css'

/* На GitHub Pages сайт живёт в подпапке — роутер должен знать её префикс,
   иначе он видит «/web-prototype-pool/workers» и не находит маршрут. */
const router = createRouter({ routeTree, basepath: import.meta.env.BASE_URL })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
