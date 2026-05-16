declare module 'circomlib' {
  export const poseidon: (items: (bigint | string | number)[]) => { toString: () => string };
  const circomlib: {
    poseidon?: typeof poseidon;
  };
  export default circomlib;
}
