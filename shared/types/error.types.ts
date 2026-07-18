export type ApiErrorDetails = string | Record<string, unknown> | unknown[];

export interface ApiErrorResponseData<TDetails = ApiErrorDetails> {
  error?: {
    code?: string;
    message?: string;
    details?: TDetails;
    fieldErrors?: Record<string, string[]>;
    timestamp?: number;
  };
  message?: string;
}
