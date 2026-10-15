const { profileUrl, profileServiceToken } = require('../config/env');

class ProfileServiceError extends Error {
  constructor() {
    super('Profile Service request failed.');
    this.name = 'ProfileServiceError';
  }
}

function createProfileClient({
  serviceUrl = profileUrl,
  serviceToken = profileServiceToken,
  fetchImplementation = fetch,
} = {}) {
  async function createProfile({ id, name, email }) {
    if (!serviceUrl || !serviceToken) {
      throw new ProfileServiceError();
    }

    let response;
    try {
      response = await fetchImplementation(`${serviceUrl.replace(/\/+$/, '')}/internal/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Token': serviceToken,
        },
        body: JSON.stringify({ id, name, email }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new ProfileServiceError();
    }

    if (response.status !== 200 && response.status !== 201) {
      throw new ProfileServiceError();
    }
  }

  return { createProfile };
}

const defaultClient = createProfileClient();

module.exports = {
  ProfileServiceError,
  createProfile: defaultClient.createProfile,
  createProfileClient,
};
