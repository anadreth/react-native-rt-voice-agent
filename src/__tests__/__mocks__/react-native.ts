export const AppState = {
  currentState: 'active',
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
};

export const Platform = {
  OS: 'ios',
};
