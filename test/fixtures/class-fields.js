import { fetchUser } from './api.js';

class UserCard extends HTMLElement {
  element;
  data;
  isReady;

  constructor() {
    super();
    this.element = null;
  }

  async loadUser(id) {
    const user = await fetchUser(id);
    this.data = user;
    this.isReady = true;
    return user;
  }
}

export { UserCard };
