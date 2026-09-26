import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  getAccount: vi.fn(),
}));

vi.mock('../../src/services/sync/vaultController', () => ({
  vaultController: {
    isConfigured: () => true,
    inspect: mocks.inspect,
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
}));

vi.mock('../../src/services/google/googleAuth', () => ({
  googleAuth: {
    getAccount: mocks.getAccount,
  },
}));

vi.mock('../../src/sync/SyncEngine', () => ({
  syncEngine: { run: vi.fn() },
}));

vi.mock('../../src/components/sync/SyncStatus', () => ({
  SyncStatus: () => <div>Sync ready</div>,
}));

vi.mock('../../src/components/sync/ConflictCenter', () => ({
  ConflictCenter: () => null,
}));

import { VaultSetup } from '../../src/components/sync/VaultSetup';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Google sync account display', () => {
  it('shows the name and email for the connected Google account', async () => {
    mocks.inspect.mockResolvedValue({
      header: { version: 2 },
      unlocked: true,
      legacyMigrationRequired: false,
    });
    mocks.getAccount.mockResolvedValue({
      displayName: 'Researcher',
      emailAddress: 'researcher@example.com',
    });

    render(<VaultSetup language="en" />);

    expect(await screen.findByText(
      'Researcher · researcher@example.com',
    )).toBeVisible();
    expect(screen.getByText('Connected · automatic sync is active')).toBeVisible();
  });
});
