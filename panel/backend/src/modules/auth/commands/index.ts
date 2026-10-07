import { SignApiTokenHandler } from './sign-api-token/sign-api-token.handler';
import { SignOttTokenHandler } from './sign-ott-token/sign-ott-token.handler';

export const COMMANDS = [SignApiTokenHandler, SignOttTokenHandler];
