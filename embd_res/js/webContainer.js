import { WebContainer } from './ext/@webcontainer/api/dist/index.js';

window.webContainer = WebContainer;
console.log("WebContainer API loaded:", window.webContainer);