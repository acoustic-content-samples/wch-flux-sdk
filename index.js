/*
Copyright IBM Corporation 2017.
LICENSE: Apache License, Version 2.0
*/
const dxSites = 'dxsites',
	siteIdRegexStr = '[\\w\\d_\\-%]',
	tenantIdRegexStr = `[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}`,
	baseUrlRegex = new RegExp(`^(?:\\/api)?(?:\\/(${tenantIdRegexStr}))?(?:(?:\\/${dxSites}\\/)(${siteIdRegexStr}+))?(?:\\/)?(?:.*)$`);
let
	host = window.location.hostname,
	protocol = window.location.protocol,
	[total, tenant, site] = baseUrlRegex.exec(document.location.pathname),
	inPreview = (host.match(/-preview/)) || getQueryVariable('x-ibm-x-preview') === 'true',
	baseUrl = '',
	apiUrl = '';
calculateUrls();

window.WchSdk = {};

let sitePromise = null;
let siteDraftPromise = null;
let navChangeFunc = () => { };
let contentPromises = {};
let subscriptions = {
	content: [],
	queries: [],
	routes: [],
	site: []
};

console.info(`wch-flux-sdk: We are ${(inPreview) ? '' : 'NOT '}in Preview`);

if (inPreview) {
	window.addEventListener('message', receiveMessage, false);
}

function receiveMessage (event) {
	if (event.data.type !== 'WchSdk.router.activeRoute.subscribe') {
		console.info('wch-flux-sdk: Route event: ', event.data);
	}

	const action = event.data.type || event.data.action;

	switch (action) {
		case 'WchSdk.refresh': {
			let flag = true;
			if (event.data.id) {
				//TODO should not need to the draft status here
				const id = event.data.id.split(':')[0];
				loadContent(id, true);
			} else {
				loadSite(site, true);
			}
			break;
		}
		case 'WchSdk.router.navigateByPath':
			navChangeFunc(event.data.path);
			break;
		case 'WchSdk.router.activeRoute.subscribe':
			window.parent.postMessage({ type: 'WchSdk.router.activeRoute.subscribeResponse' }, event.origin);
			break;
		case 'inlineedit.pageChanged':
			loadSite(site, true);
			break;
		default:
			console.info('wch-flux-sdk: Unhandled event', event.data.type);
			break;
	}
}

export function isPreview () {
	return inPreview;
}

export function changeNavEvent (pageId) {
	window.parent.postMessage(
		{
			type: 'WchSdk.router.activeRoute',
			page: getPage(pageId)
		}, '*');
}

export function configWCH (hostname = window.location.hostname, tenantId = window.location.pathname.split('/')[1], siteId) {
	host = hostname;
	tenant = tenantId;
	if (siteId) {
		site = siteId;
	}
	calculateUrls();
	inPreview = (host.match(/-preview\.ibm\.com/)) || getQueryVariable('x-ibm-x-preview') === 'true';
}

export function getHost () {
	return host;
}

export function getTenant () {
	return tenant;
}

export function getBaseUrl () {
	return baseUrl;
}

export function getApiUrl () {
	return apiUrl;
}

export function setNavChangeFunction (func) {
	navChangeFunc = func;
}

export let WchStore = {
	content: {},
	queries: {},
	routes: {},
	site: {}
};

export function subscribe (to, callback) {
	if (!subscriptions.hasOwnProperty(to)) {
		subscriptions[to] = [];
	}

	let index = subscriptions[to].push(callback) - 1;

	return {
		unsubscribe() { delete subscriptions[to][index]; }
	};
}

export function updateContent (content) {
	WchStore.content = Object.assign({}, WchStore.content, { [content.id]: content });
	subscriptions.content.forEach(sub => sub('update-content', content));
}

export function createDraftImageUrl (image, rendition) {
	if (image) {
		let source = image.renditions.default.source;

		if (image.renditions[rendition]) {
			source = image.renditions[rendition].source;
		}
		return `${protocol}//${host}/api${source}`;
	}
	return '';
}

export function loadContent (id, force = false, onError) {
	if (!force && contentPromises[id] && WchStore.content[id] || !id) {
		return;
	}

	if (!contentPromises[id] || force) {
		contentPromises[id] = fetch(`${apiUrl}/delivery/v1/rendering/context/${id}`, getRequestHeaders()).then(res => {
			if (!res.ok && onError) {
				onError(res.status, res.statusText);
			}
			return res.json();
		});
	}

	contentPromises[id].then(content => {
		for (let element in content.elements) {
			let values = _getReferenceValues(content, element);
			values.forEach((value) => {
				if (value && value.classification) {
					const c = Object.assign({}, value);
					contentPromises[c.id] = Promise.resolve(c);
					loadContent(c.id, force);
				}
			})
		}

		if (!content.errors) {
			WchStore.content = Object.assign({}, WchStore.content, { [id]: content });
			subscriptions.content.forEach(sub => sub('load-content', content));
		}
	});
}

function _getReferenceValues (content, element) {
	if (content.elements[element].elementType === 'reference') {
		let values = content.elements[element].values || [content.elements[element].value];
		return values;
	}
	return [];
}

export function loadContentDraft (id, force=false, onError) {
	if (!force && contentPromises[id] && WchStore.content[id] || !id) {
		return;
	}

	if (!contentPromises[id] || force) {
		contentPromises[id] = fetch(`${apiUrl}/delivery/v1/rendering/context/${id}`, {
			}).then(res => {
				if (!res.ok && onError) {
			onError(res.status, res.statusText);
		}
		return res.json();
	});
	}

	contentPromises[id].then(content => {
		for (let element in content.elements) {
			if (content.elements[element].elementType === 'reference' && content.elements[element].value) {
				if (!content.elements[element].value.classification) {
					break;
				}

				const c = Object.assign({}, content.elements[element].value);
				contentPromises[c.id] = Promise.resolve(c);
				loadContent(c.id);
			}
		}
		if(content.hasOwnProperty('kind') && content.kind[0] === 'page') {
			loadSite(site, true);
			return 'page';
		}

		WchStore.content = Object.assign({}, WchStore.content, {[id]: content});
		subscriptions.content.forEach(sub => sub('load-content', content));
	});
}

export function getContent (id) {
	return WchStore.content[id];
}

function mapNav (pages) {
	for (let i = 0; i < pages.length; i++) {
		WchStore.routes = Object.assign({}, WchStore.routes, {
			[pages[i].route]: {
				contentId: pages[i].contentId,
				layoutId: pages[i].layoutId
			}
		});
		if (pages[i].children && pages[i].children.length > 0) {
			mapNav(pages[i].children);
		}
	}
}

export function loadSite (siteName, force = false) {
	siteName = siteName ? siteName : site ? site : 'default';
	if (!force && sitePromise && Object.keys(WchStore.site).length !== 0) {
		return;
	}

	if (!sitePromise || force) {
		sitePromise = fetch(`${apiUrl}/delivery/v1/rendering/sites/${siteName}`, getRequestHeaders()).then(res => res.json());
	}

	sitePromise.then(site => {
		mapNav(site.pages);
		WchStore.site = Object.assign({}, WchStore.site, site);
		subscriptions.site.forEach(sub => sub('load-site'));
		subscriptions.routes.forEach(sub => sub('load-site'));
	});
}

export function getSite () {
	return WchStore.site;
}

export function getRoute (route) {
	return WchStore.routes[route];
}

export function getPage (contentId) {
	return getSite().pages.find((page) => {
		return page.contentId === contentId;
	})
}

export function getRouteForContentId (id) {
	return Object.keys(WchStore.routes).find(key => WchStore.routes[key].contentId === id);
}

export function getQueryString (type, rows) {
	return `q=type:%22${type}%22&fq=classification:(content)&fq=isManaged:(%22true%22)&sort=lastModified desc&fl=document:%5Bjson%5D,lastModified&rows=${rows}`;
}

export function queryContent (type, rows) {

	let searchQuery = getQueryString(type, rows);
	fetch(`${apiUrl}/delivery/v1/rendering/search?${searchQuery}`, getRequestHeaders()).then(res => {
		res.json().then(results => {
			if (results.numFound > 0) {
				results.documents.map(item => item.document).forEach(item => {
					contentPromises[item.id] = Promise.resolve(item);

					loadContent(item.id);
				});
			}

			WchStore.queries = Object.assign({}, WchStore.queries, {
				[searchQuery]: {
					numFound: results.numFound,
					itemIds: results.documents.map(item => item.document.id),
					itemsContext: results.documents.map(item => item.document)
				}
			});
			subscriptions.queries.forEach(sub => sub('query-content'));
		});
	});
}

export function getQuery (queryString) {
	return WchStore.queries[queryString];
}

export function getImageUrl (image, rendition = 'default') {

	if (image && image.renditions) {
		let url = image.renditions.default.url;
		if (image.renditions[rendition]) {
			url = image.renditions[rendition].url;
		}
		return `${protocol}//${host}${url}`;
	}

	if (image && image.url) {
		let url = image.url;
		return `${protocol}//${host}${url}`;
	}

	return '';
}

export function getVideoUrl (video) {
	if (video) {
		return `${protocol}//${host}${video.url}`;
	}
	return '';
}

export function getFileUrl (file) {
	if (file) {
		return `${protocol}//${host}${file.url}`;
	}
	return '';
}

export function getFirstCategory (element, defaultValue = 'medium') {
	if (element.categories) {
		return element.categories[0].split('/').pop().toLowerCase();
	}
	return defaultValue;
}

export function sortQueriedItems (items, field, sortOrder, maxItemsToDisplay) {
	let itemType = (items && items[0] && items[0].elements[field]) ? items[0].elements[field].elementType : '';

	//only sort if there is a valid field to sort on
	if (itemType) {
		items.sort((a, b) => {
			let itemA = a.elements[field].value;
			let itemB = b.elements[field].value;
			switch (itemType) {
				case 'datetime': {
					return sortGeneric(new Date(itemA), new Date(itemB));
				}
				default: {
					return sortGeneric(itemA, itemB);
				}
			}
		});

		// reverse Date so the latest dates are first in the list
		if (sortOrder === 'by date descending' || sortOrder === 'Alphabetical descending') {
			items.reverse();
		}

		if (maxItemsToDisplay) {
			items = items.slice(0, maxItemsToDisplay);
		}
	}

	return (items);
}

function sortGeneric (a, b) {
	if (a < b) {
		return -1;
	} else if (a > b) {
		return 1;
	}
	return 0;
}

function getRequestHeaders () {
	return inPreview ? { credentials: 'include' } : {};
}

function getQueryVariable (variable) {
	const query = window.location.search.substring(1);
	const vars = query.split('&');
	for (let i = 0; i < vars.length; i++) {
		const pair = vars[i].split('=');
		if (pair[0] === variable) { return pair[1]; }
	}
	return (false);
}

function calculateUrls () {
	baseUrl = tenant
		? site
			? `${tenant}/${dxSites}/${site}` // site and tenant
			: `${tenant}` // just tenant
		: site
			? `${dxSites}/${site}` // just site
			: ''; // no IDs
		// Check if the host contains -preview in the url if in preview mode
		if (inPreview && apiUrl.indexOf('-preview') === -1) {
			const hostDetails = host.split(".goacoustic.");
			apiUrl = `${protocol}//${hostDetails[0]}-preview.goacoustic.com/api/${baseUrl}`
		} else {
			apiUrl = `${protocol}//${host}/api/${baseUrl}`;
		}
		console.info(`wch-flux-sdk: url is "${apiUrl}"` + (tenant ? `, tenant id is "${tenant}"` : '') + (site ? `, site id is "${site}"` : ''));
}
