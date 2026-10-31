import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from './auth';

export function createHandler(
  controllerFn: (req: any, res: any) => Promise<any>,
  options?: { roles?: string[] }
) {
  return async (req: NextRequest, context?: { params?: Promise<any> | any }) => {
    try {
      const authUser = getAuthUserFromRequest(req);
      if (!authUser) {
        return NextResponse.json({ error: 'Access token required. Please login first.' }, { status: 401 });
      }

      if (options?.roles && !options.roles.includes(authUser.role)) {
        return NextResponse.json(
          { error: `Access Denied! Role '${authUser.role}' is not authorized.` },
          { status: 403 }
        );
      }

      let body = {};
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        try {
          body = await req.json();
        } catch {
          body = {};
        }
      }

      const searchParams = Object.fromEntries(new URL(req.url).searchParams.entries());
      const rawParams = context?.params ? await context.params : {};

      let responseStatus = 200;
      let responseBody: any = null;
      const responseHeaders: Record<string, string> = {};

      const mockRes = {
        status: (code: number) => {
          responseStatus = code;
          return mockRes;
        },
        json: (data: any) => {
          responseBody = data;
          return mockRes;
        },
        setHeader: (name: string, val: string) => {
          responseHeaders[name] = val;
          return mockRes;
        },
      };

      const mockReq = {
        user: authUser,
        body,
        query: searchParams,
        params: rawParams,
        headers: Object.fromEntries(req.headers.entries()),
      };

      await controllerFn(mockReq, mockRes);

      return NextResponse.json(responseBody, {
        status: responseStatus,
        headers: responseHeaders,
      });
    } catch (err: any) {
      console.error('API Adapter error:', err);
      return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
  };
}

