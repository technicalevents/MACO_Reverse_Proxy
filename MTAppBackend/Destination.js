const OAuth2 = require("oauth").OAuth2;
const cfenv = require("cfenv");
const rp = require("request-promise");

const HTTP_Verb = {
    GET: 'GET',
    POST: 'POST',
    PATCH: 'PATCH',
    PUT: 'PUT',
    DELETE: 'DELETE',
    HEAD: 'HEAD',
    OPTIONS: 'OPTIONS'
};

class Destination {
	/**
	 * @param {string} clientId
	 * @param {string} clientSecret
	 * @param {string} baseUrl - url to the OAuth server, emitting "/oauth/*" endpoints
	 * @returns {Promise<any>}
	 */
	getAccessTokenForDestinationInstance(clientId, clientSecret, baseUrl) {
			if (cfenv.getAppEnv().isLocal) {
				return Promise.resolve("mockLocalAccessToken");
			}
			return new Promise((resolve, reject) => {
				const oAuthClient = new OAuth2(clientId, clientSecret, `${baseUrl}/`, '/oauth/authorize', 'oauth/token', null);
				oAuthClient.getOAuthAccessToken('', {
						grant_type: 'client_credentials'
					},
					(err, accessToken, refreshToken, results) => {
						if (err) {
							reject(err);
						}
						resolve(accessToken);
					});

			});

		}

		/**
		 *
		 * @param {string} clientId
		 * @param {string} clientSecret
		 * @param {string} baseUrl - url to the OAuth server, emitting "/oauth/*" endpoints
		 * @returns {Promise<any>}
		 */
		getAccessTokenForProxy(clientId, clientSecret, baseUrl) {
			if (cfenv.getAppEnv().isLocal) {
				return Promise.resolve("mockLocalProxyToken");
			}
			return new Promise((resolve, reject) => {
				const oAuthClient = new OAuth2(clientId, clientSecret, `${baseUrl}/`, '/oauth/authorize', 'oauth/token', null);
				oAuthClient.getOAuthAccessToken('', {
						grant_type: 'client_credentials'
					},
					(err, accessToken, refreshToken, results) => {
						if (err) {
							reject(err);
						}
						resolve(accessToken);
					});

			});

		}

	/**
	 * retrieve destination configuration
	 *
	 * @param {string} destinationName
	 * @param {string} destinationApiUrl
	 * @param {string} accessToken - OAuth2.0 Bearer token ("client_credentials" grant type)
	 * @returns {Promise<T | never>}
	 */
	getDestination(destinationName, destinationApiUrl, accessToken) {
		if (cfenv.getAppEnv().isLocal) {
			let object = {
				"destinationConfiguration": {
					"URL": destinationName
				}
			};
			return Promise.resolve(JSON.stringify(object));
		}
		const options = {
			url: `${destinationApiUrl}/${destinationName}`,
			headers: {
				'Authorization': `Bearer ${accessToken}`
			}
		};

		return rp(options)
			.catch(err => {
				throw err; // bubble-up
			});
	}

	/**
	 * call a url in a destination via CF's included proxy
	 *
	 * @param {Map} parameters - various configuration options
	 * @param {string} parameters.url - the absolute path (e.g. /my/api) to call in the destination
	 * @param {object} parameters.destination - CF destination configuration object
	 * @param {string} parameters.proxy - CF's integrated proxy as FQDN, e.g. http://10.0.1.23:20003
	 * @param {string} parameters.proxyAccessToken - OAuth2.0 Bearer token ("client_credentials" grant type)
	 * @param {string} [parameters.contentType]
	 * @param {('GET'|'POST'|'PUT'|'PATCH'|'DELETE'|'HEAD'|'OPTIONS')} parameters.http_method
	 * @param {object} [parameters.payload] - payload for POST, PUT or PATCH
	 * @param {object} [parameters.formData] - play a browser a submit a form!
	 * @param {boolean} [parameters.fullResponse] - pass entire reponse through from BE via proxy
	 * @param {boolean} [parameters.techErrorOnly] - get a rejection only if the request failed for technical reasons
	 * @param {boolean} [parameters.binary] - whether to expect (and deliver) a binary at @param url
	 * @returns {Promise<T | never>}
	 */
	callViaDestination(parameters) {
		let {
			url,
			destination,
			proxy,
			proxyAccessToken,
			contentType = 'application/json',
			http_method,
			payload,
			fullResponse,
			formData,
			techErrorOnly,
			binary
		} = parameters;

		let headers = {};
		let options = {
			url: `${destination.destinationConfiguration.URL}${url}`,
			resolveWithFullResponse: fullResponse,
			simple: !techErrorOnly
		};

		// this allows binary downloads
		if (binary) {
			Object.assign(options, {
				encoding: null
			});
		}

		// enhance only if running in CF
		if (!cfenv.getAppEnv().isLocal) {
			// add auth for proxy
			headers = {
				'Proxy-Authorization': `Bearer ${proxyAccessToken}`
			};
			// add proxy
			Object.assign(options, {
				proxy: proxy
			});
		}

		// if configured in CF cockpit,
		// use auth data
		if (destination.authTokens && destination.authTokens[0]) {
			headers['Authorization'] = `${destination.authTokens[0].type} ${destination.authTokens[0].value}`;
			//headers['Authorization'] = 'Basic ' + new Buffer.from("AGARWALVAIB0" + ':' + "1vA@ibhav").toString('base64');
		}

		// enrich query option based on http verb
		switch (http_method) {
		case HTTP_Verb.GET:
			Object.assign(options, {
				method: HTTP_Verb.GET,
				headers: Object.assign(headers, {
					'Content-type': contentType
				})
			});
			break;
		case HTTP_Verb.HEAD:
			Object.assign(options, {
				method: HTTP_Verb.HEAD,
				headers: Object.assign(headers, {
					'Content-type': contentType
				})
			});
			break;
		case HTTP_Verb.OPTIONS:
			Object.assign(options, {
				method: HTTP_Verb.OPTIONS,
				headers: headers
			});
			break;
		case HTTP_Verb.POST:
			// processing of "browser submitting form" behaviour
			// and regular (JSON) post is different
			if (parameters.formData) {
				Object.assign(options, {
					method: HTTP_Verb.POST,
					headers: headers,
					formData: formData
				});
			} else {
				Object.assign(options, {
					method: HTTP_Verb.POST,
					headers: Object.assign(headers, {
						'Content-type': contentType
					}),
					body: payload,
					json: true
				});
			}
			break;
		case HTTP_Verb.PUT:
			Object.assign(options, {
				method: HTTP_Verb.PUT,
				headers: Object.assign(headers, {
					'Content-type': contentType
				}),
				body: payload,
				json: true
			});
			break;
		case HTTP_Verb.PATCH:
			Object.assign(options, {
				method: HTTP_Verb.PATCH,
				headers: Object.assign(headers, {
					'Content-type': contentType
				}),
				body: payload,
				json: true
			});
			break;
		case HTTP_Verb.DELETE:
			Object.assign(options, {
				method: HTTP_Verb.DELETE,
				headers: headers
			});
			break;
		}
		return new Promise(function (resolve, reject) {
			return resolve({data: options});
		});
	}
	// 	return rp(options)
	// 		.catch(err => {
	// 			throw err; // bubble-up
	// 		});
	// }

	/**
	 *
	 * @param {Map} options - configuration options for several CF service instances
	 * @param {string} options.url - the url to call in the destination, absolute path (including leading slash)
	 *                              e.g. /api/v1/json
	 * @param {string} options.connectivity_instance - name of the instance of the connectivity service
	 * @param {string} options.uaa_instance - name of the instance of the uaa service
	 * @param {string} options.destination_instance - name of the instance of the destination service
	 * @param {string} options.destination_name - name of the destination to use
	 * @param {('GET'|'POST'|'PUT'|'PATCH'|'DELETE'|'HEAD'|'OPTIONS')} options.http_verb - HTTP method to use
	 * @param {object} [options.payload] - payload for POST, PUT or PATCH
	 * @param {object} [options.formData] - mimic a browser for POSTing a form to the destination; implies http verb POST
	 * @param {string} [options.content_type] - value for "Content-Type" http header, e.g. "application/json"
	 * @param {boolean} [options.full_response] - whether to have the full response (including all headers etc)
	 *                                          pass through to the caller (BE -> proxy -> client)
	 * @param {boolean} [options.tech_error_only] - get a rejection only if the request failed for technical reasons,
	 *                                          so e.g. 404 is considered a valid response
	 * @param {boolean} [options.binary] - whether to expect (and deliver) a binary at @param url
	 * @returns {Promise<any | never>}
	 */
	callDestination(options) {
		// safeguards
		if (!HTTP_Verb.hasOwnProperty(options.http_verb)) {
			throw Error(`unknown http method: ${options.http_verb}; allowed values: ${JSON.stringify(HTTP_Verb)}`);
		}

		// build up necessary variables
		let connectivityInstance;
		let connectivityClientId;
		let connectivityClientSecret;
		let proxy;
		let xsuaaInstance;
		let xsuaaUrl;
		let destinationInstance;
		let destinationApi;
		let destinationClientId;
		let destinationClientSecret;

		// differentiate between running in non-CF and CF environment
		if (!cfenv.getAppEnv().isLocal) {
			connectivityInstance = cfenv.getAppEnv().getService(options.connectivity_instance);
			connectivityClientId = connectivityInstance.credentials.clientid;
			connectivityClientSecret = connectivityInstance.credentials.clientsecret;
			proxy = `http://${connectivityInstance.credentials.onpremise_proxy_host}:${connectivityInstance.credentials.onpremise_proxy_port}`;

			xsuaaInstance = cfenv.getAppEnv().getService(options.uaa_instance);
			xsuaaUrl = xsuaaInstance.credentials.url;

			destinationInstance = cfenv.getAppEnv().getService(options.destination_instance);
			destinationApi = `${destinationInstance.credentials.uri}/destination-configuration/v1/destinations`;
			destinationClientId = destinationInstance.credentials.clientid;
			destinationClientSecret = destinationInstance.credentials.clientsecret;
		} else {
			connectivityClientId = 'connectivityClientId';
			connectivityClientSecret = 'connectivityClientSecret';
			proxy = null;

			xsuaaUrl = 'http://localhost';

			destinationApi = `http://localhost/destination-configuration/v1/destinations`;
			destinationClientId = 'destinationClientId';
			destinationClientSecret = 'destinationClientSecret';
		}

		let queriedDestination = {};

		return Destination.getAccessTokenForDestinationInstance(destinationClientId, destinationClientSecret, xsuaaUrl);
			// .then(accessTokenForDestination => {
			// 	return accessTokenForDestination;
			// 	//return Destination.getDestination(options.destination_name, destinationApi, accessTokenForDestination);
			// });
			// .then(destination => {
			// 	queriedDestination = JSON.parse(destination);
			// //	return Destination.getAccessTokenForProxy(connectivityClientId, connectivityClientSecret, xsuaaUrl);
			// return destination;
			// });
			// .then(accessTokenForProxy => {
			// 	return Destination.callViaDestination({
			// 		url: options.url,
			// 		destination: queriedDestination,
			// 		proxy: proxy,
			// 		proxyAccessToken: String(accessTokenForProxy),
			// 		contentType: options.content_type || undefined,
			// 		http_method: options.http_verb,
			// 		payload: options.payload || undefined,
			// 		formData: options.formData || undefined,
			// 		fullResponse: options.full_response || false,
			// 		techErrorOnly: options.tech_error_only || false,
			// 		binary: options.binary || false
			// 	});
			// })
			// .then(data => {
			// 	return data;
			// })
			// .catch(err => {
			// 	console.error(`couldn't query BE resource via destination: ${JSON.stringify(err)}`);
			// 	throw err; // re-throw for bubble-up
			// });

	}
}

module.exports = Destination;