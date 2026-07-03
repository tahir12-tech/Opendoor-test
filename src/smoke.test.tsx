/* Render smoke test: mounts every route for every role in jsdom (render +
   effects) and asserts nothing throws. Run with `npm run smoke`. */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from './session/SessionContext';
import { ToastProvider } from './components/ui/Toast';
import { App } from './App';
import type { Role } from './data';

const routes = [
  '/login', '/forgot-password', '/dashboard', '/league', '/league?view=branch', '/league?view=referrer',
  '/activity', '/applications', '/applications/GR-20418', '/applications/GR-20489', '/new-application', '/agencies',
  '/partners', '/users', '/users?team=opndoor', '/reconciliation', '/help',
];
const roles: Role[] = ['superadmin', 'management', 'referrer'];

afterEach(cleanup);

describe('routes render without crashing', () => {
  for (const role of roles) {
    for (const path of routes) {
      it(`[${role}] ${path}`, () => {
        localStorage.setItem('grp_role', role);
        expect(() =>
          render(
            <MemoryRouter initialEntries={[path]}>
              <SessionProvider>
                <ToastProvider>
                  <App />
                </ToastProvider>
              </SessionProvider>
            </MemoryRouter>,
          ),
        ).not.toThrow();
      });
    }
  }
});
