export type ApiSuccess<T> = { success: true; data: T; requestId: string };
export type ApiError = {
  success: false;
  error: { code: string; message: string; details?: unknown };
  requestId: string;
};
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function apiSuccess<T>(data: T, requestId?: string): Response {
  return Response.json({
    success: true,
    data,
    requestId: requestId ?? crypto.randomUUID(),
  });
}

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): Response {
  return Response.json(
    {
      success: false,
      error: { code, message, details },
      requestId: crypto.randomUUID(),
    },
    { status },
  );
}
