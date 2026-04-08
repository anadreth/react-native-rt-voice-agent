export const AppState = {
  currentState: 'active',
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
};
