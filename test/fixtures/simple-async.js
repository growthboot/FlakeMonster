import {fetchData} from './api.js';
async function loadUser(id) {
  const user = await fetchData(`/users/${id}`);
  const profile = await fetchData(`/profiles/${id}`);
  return {
    user,
    profile
  };
}
async function saveUser(user) {
  const result = await fetchData('/users', {
    method: 'POST',
    body: user
  });
  console.log('saved');
  return result;
}
export {loadUser, saveUser};
