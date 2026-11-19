/// <reference types="vite/client" />

declare module '../client/src/*' {
  const value: any;
  export default value;
  export const AuthProvider: any;
  export const CartProvider: any;
}
