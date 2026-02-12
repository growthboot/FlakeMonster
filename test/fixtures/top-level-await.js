import {fetchData} from './api.js';

const config = await fetchData('/config');
const user = await fetchData(`/users/${config.defaultId}`);

console.log('loaded', user.name);

export {config, user};
