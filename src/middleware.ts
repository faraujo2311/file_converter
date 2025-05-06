import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// NOTE: This is a placeholder middleware.
// Full implementation requires integrating with an authentication system (e.g., Firebase Auth)
// to check user sessions, roles, and redirect appropriately.

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Placeholder: Assume all paths except /login, /register, /forgot-password require authentication
  const requiresAuth = !['/login', '/register', '/forgot-password'].some(path => pathname.startsWith(path));
  const isAuthenticated = false; // Replace with actual check (e.g., reading a session cookie/token)

  // Redirect unauthenticated users trying to access protected routes to login
  if (requiresAuth && !isAuthenticated) {
    // Temporarily disable redirection during development until login is implemented
    // return NextResponse.redirect(new URL('/login', request.url));
     console.log(`Middleware: Accessing protected route ${pathname} without authentication (redirect disabled).`);
  }

  // Redirect authenticated users trying to access login/register to dashboard (or home for now)
  if (['/login', '/register'].includes(pathname) && isAuthenticated) {
     // Temporarily disable redirection
     // return NextResponse.redirect(new URL('/', request.url)); // Redirect to dashboard or home
     console.log(`Middleware: Accessing auth route ${pathname} while authenticated (redirect disabled).`);
  }


  // Allow the request to proceed
  return NextResponse.next();
}

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - / (the root path itself, allowing access to landing/home before login decision)
     */
    //'/((?!api|_next/static|_next/image|favicon.ico).*)', // Original matcher
    // Adjusted matcher to allow root access, apply logic within middleware
     '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
