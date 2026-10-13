import type { NextFunction, Request, Response } from "express";
import { verifyToken, type AuthUser } from "./auth";

// Express 的 Request 上没有 user，这里扩展类型。
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new HttpError(401, "未登录"));
  }
  try {
    req.user = verifyToken(header.slice("Bearer ".length));
    next();
  } catch {
    next(new HttpError(401, "登录已过期，请重新登录"));
  }
}

export function requireRole(role: "ADMIN" | "TEACHER") {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, "未登录"));
    if (req.user.role !== role) {
      return next(new HttpError(403, "没有权限执行此操作"));
    }
    next();
  };
}

/**
 * 权限规则 #5：admin 可读全部学生，但只能写自己名下的学生。
 * 传入 student 的 adminId，由调用方保证 student 已加载。
 */
export function assertCanWriteStudent(
  user: AuthUser,
  studentAdminId: string
) {
  if (user.role !== "ADMIN") {
    throw new HttpError(403, "只有课程顾问可以操作学生");
  }
  if (studentAdminId !== user.id) {
    throw new HttpError(403, "只能操作自己名下的学生");
  }
}
