import { type Response } from '@playwright/test';

export function isTrygdeavgiftBeregningResponse(response: Response): boolean {
  return (
    (response.url().includes('/trygdeavgift/beregning') ||
      response.url().includes('/trygdeavgift/eos-pensjonist/beregning')) &&
    response.status() === 200
  );
}
