declare global {
  namespace Express {
    interface Request {
      /** Short per-request id, echoed in the X-Request-Id header and the logs. */
      id: string;
    }
  }
}

export {};
