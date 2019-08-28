/*eslint no-console: 0, no-unused-vars: 0*/
"use strict";

const Utils = require("./Util");
const Destination = require("./Destination");
const url = require("url");

var xsenv = require("@sap/xsenv");
var xssec = require("@sap/xssec");
var express = require("express");
var passport = require("passport");
var bodyParser = require("body-parser");

const callDestination = require('sap-cf-destination');

//const request = require("request");

// We get environment variables of the current application

var app = express();

var oDestinationMapping = JSON.parse(process.env.Destination_Mapping);
var sCurrentTenantName = oDestinationMapping[0].tenant;
const request = require('request-promise');
const cfenv = require("cfenv");

const destination = Utils.getServiceByName("destination");

const appEnv = cfenv.getAppEnv();
const credentials = appEnv.getServiceCreds('mta_destination');
const destClientId = credentials.clientid;
const destClientSecret = credentials.clientsecret;
const destUri = credentials.uri; //https://destination-configuration.cfapps.eu10.hana.ondemand.com
const destAuthUrl = credentials.url; //https://bssubaccount.authentication.eu10.hana.ondemand.com 
var queriedDestination;
// const uaa     = require('predix-uaa-client');

// /*********************************************************
//  * Parse env varaiable to find services
//  *********************************************************/
// const services = xsenv.getServices({
// 	connectivity: { tag: 'connectivity' },
// 	destination:  { tag: 'destination'  },
// 	xsuaa:        { tag: 'xsuaa'        }
// });

passport.use("JWT", new xssec.JWTStrategy(xsenv.getServices({
	uaa: {
		tag: "xsuaa"
	}
}).uaa));
app.use(passport.initialize());
app.use(passport.authenticate("JWT", {
	session: false
}));
app.use(bodyParser.json());

// subscribe/onboard a subscriber tenant
app.put("/callback/v1.0/tenants/*", function (req, res) {
	var tenantAppURL = "https:\/\/" + req.body.subscribedSubdomain + "-trial-dev-mtapprouter" + ".cfapps.eu10.hana.ondemand.com";
	res.status(200).send(tenantAppURL);
});

// unsubscribe/offboard a subscriber tenant
app.delete("/callback/v1.0/tenants/*", function (req, res) {
	res.status(200).send("");
});

// // destination service is protected with OAuth 
// const _getTokenForDestinationService = function() {
//     return new Promise((resolve, reject) => {
//       uaa.getToken(services.xsuaa.url + "/oauth/token", destClientId, destClientSecret)
//         .catch((error) => {
//             return reject({message: 'Error: failed to get access token for Destination service', error: error}); 
//         })
//         .then((result) => {
//             resolve({message:'Successfully fetched token for Destination service.', tokenInfo: result});
//         });
//     });
// };

// call the REST API of the Cloud Foundry Destination service to get the configuration info as configured in the cloud cockpit
const _getDestinationConfig = function (destinationName, authorizationHeaderValue) {
	return new Promise(function (resolve, reject) {
		let fullDestinationUri = destUri + '/destination-configuration/v1/destinations/' + destinationName;
		const options = {
			url: fullDestinationUri,
			resolveWithFullResponse: true,
			headers: {
				Authorization: authorizationHeaderValue
			}
		};
		// do HTTP call 
		request(options)
			.catch((error) => {
				return reject({
					message: 'Error occurred while calling Destination service',
					error: error
				});
			})
			.then((response) => {
				if (response && response.statusCode == 200) {
					let jsonDestInfo = JSON.parse(response.body);
					return resolve({
						message: 'Successfully called Destination service.',
						destinationInfo: jsonDestInfo
					});
				} else {
					reject('Error: failed to call destination service. ' + response.body);
				}
			});
	});
};

const _doQUERY = function (serviceUrl, authorizationHeaderValue) {
	return new Promise(function (resolve, reject) {
		const options = {
			method: 'GET',
			url: serviceUrl,
			resolveWithFullResponse: true,
			family: 4,
			headers: {
				Authorization: 'Basic ' + new Buffer.from("AGARWALVAIB0" + ':' + "1vA@ibhav").toString('base64'),
				Accept: 'application/json'
			},
			rejectUnauthorized: false, //add when working with https sites
			requestCert: false, //add when working with https sites
			agent: false //add when working with https sites 
		};

		request(options)
			.then((response) => {
				if (response && response.statusCode == 200) {
					resolve({
						responseBody: response.body
					});
				}
				return reject({
					message: 'Error while calling OData service'
				});
			})
			.catch((error) => {
				reject({
					message: 'Error occurred while calling OData service',
					error: error
				});
			});
	});
};

	const HTTP_Verb = {
    GET: 'GET',
    POST: 'POST',
    PATCH: 'PATCH',
    PUT: 'PUT',
    DELETE: 'DELETE',
    HEAD: 'HEAD',
    OPTIONS: 'OPTIONS'
};

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
	 
	const callViaDestination = function(parameters) {
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
			url: "https://ldcisd9.wdf.sap.corp:44311" + url,
		//	url: destination.destinationConfiguration.URL + url,
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
				'Proxy-Authorization': "Bearer " + proxyAccessToken
			};
			// add proxy
			Object.assign(options, {
				proxy: proxy
			});
		}

		// if configured in CF cockpit,
		// use auth data
		if (destination.authTokens && destination.authTokens[0]) {
			headers['Authorization'] = destination.authTokens[0].type + " " + destination.authTokens[0].value;
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
		
		// return new Promise((resolve, reject) => {
		// 	return resolve(options);
		// });
		
		return request(options)
			.catch(err => {
				throw err; // bubble-up
			});
	};
	


// server response
app.get("/sap/opu/odata/sap/ZSA_OPPORTUNITY_ODATA_SRV/$metadata", function (req, res) {
	// 1a) get access token for destination service
	Utils.getJWTTokenForService(destination)
		.then(token => {
			var oRequiredDestinationMap = oDestinationMapping.filter(function (value) {
				return value.tenant === "47aa380c-4f1d-439f-ab07-5784e5074e8e";
			});
			var sDestinameName = oRequiredDestinationMap[0].destination;

			// 1b) call the destination service 
			return _getDestinationConfig(sDestinameName, 'Bearer ' + token);
		})
		.then(result => {
			queriedDestination = JSON.parse(result);
			return Utils.getJWTTokenForService(Utils.getServiceByName("connectivity"));
		})
		.then(token => {
			return callViaDestination({
				desturl: "/sap/opu/odata/sap/ZSA_OPPORTUNITY_ODATA_SRV/OpportunityHeaderSet",
				destination: queriedDestination,
				proxy: "http://connectivityproxy.internal.cf.eu10.hana.ondemand.com:20003",
				proxyAccessToken: String(token),
				contentType: "application/json" || undefined,
				http_method: "GET",
				payload: undefined,
				formData: undefined,
				fullResponse: false,
				techErrorOnly: false,
				binary: false
			});
		}).then(result => {
			res.send('<h2>RESULT of request to Backend service:</h2>OData service response: <p>' + JSON.stringify(result) + '</p>');
		})
		.catch(error => {
			res.send('ERROR: ' + error.message + ' - FULL ERROR: ' + error.error);
		});
});

app.get("/sap/opu/odata/sap/ZSA_OPPORTUNITY_ODATA_SRV/", function (req, res) {
	// var oRequiredDestinationMap = oDestinationMapping.filter(function (value) {
	// 			return value.tenant === "47aa380c-4f1d-439f-ab07-5784e5074e8e";
	// });

	// var sDestinameName = oRequiredDestinationMap[0].destination;
	// console.log("sDestinameName: " + sDestinameName);

	// const response = callDestination({
	// 	url: "/sap/opu/odata/sap/ZSA_OPPORTUNITY_ODATA_SRV/OpportunityHeaderSet",
	//       connectivity_instance: 'mta_connetivity',
	//       uaa_instance: 'MTAppUAA',
	//       destination_instance: 'mta_destination',
	//       destination_name: "MTAPPDest1",
	//       http_verb: 'GET'
	// });

	// console.log("sDestinameName: " + sDestinameName);

	// response.then(response => {
	//  	res.status(200).send('<h2>RESULT of request to Backend service:</h2>OData service response:</h2>');
	// });

	Utils.getJWTTokenForService(destination)
		.then(token => {
			// var oRequiredDestinationMap = oDestinationMapping.filter(function (value) {
			// 	return value.tenant === "47aa380c-4f1d-439f-ab07-5784e5074e8e";
			// });
			// var sDestinameName = oRequiredDestinationMap[0].destination;

			// 1b) call the destination service 
			return _getDestinationConfig("MTAPPDest1", 'Bearer ' + token);
		})
		.then(result => {
			queriedDestination = result.destinationInfo;
			return Utils.getJWTTokenForService(Utils.getServiceByName("connectivity"));
		})
		.then(token => {
			return callViaDestination({
				url: "/sap/opu/odata/sap/ZSA_OPPORTUNITY_ODATA_SRV/OpportunityHeaderSet",
				destination: queriedDestination,
				proxy: "http://connectivityproxy.internal.cf.eu10.hana.ondemand.com:20003",
				proxyAccessToken: String(token),
				contentType: "application/json" || undefined,
				http_method: "GET",
				payload: undefined,
				formData: undefined,
				fullResponse: false,
				techErrorOnly: false,
				binary: false
			});
		}).then(result => {
			res.send('<h2>RESULT of request to Backend service:</h2>OData service response: <p>' + JSON.stringify(result) + '</p>');
		})
		.catch(error => {
			res.send('ERROR: ' + error.message + ' - FULL ERROR: ' + error.error);
		});
});

app.get("/sap/opu/odata/sap/ZSA_OPPORTUNITY_ODATA_SRV", function (req, res) {
	// var oRequiredDestinationMap = oDestinationMapping.filter(function (value) {
	// 			return value.tenant === "47aa380c-4f1d-439f-ab07-5784e5074e8e";
	// });
	// var sDestinameName = oRequiredDestinationMap[0].destination;

	// console.log("sDestinameName: " + sDestinameName);
	// const response = callDestination({
	// 	url: "/sap/opu/odata/sap/ZSA_OPPORTUNITY_ODATA_SRV/OpportunityHeaderSet",
	//       connectivity_instance: 'mta_connetivity',
	//       uaa_instance: 'MTAppUAA',
	//       destination_instance: 'mta_destination',
	//       destination_name: "MTAPPDest1",
	//       http_verb: 'GET'
	// });

	// console.log("sDestinameName: " + sDestinameName);

	// response.then(accessTokenForDestination => {
	//  	res.send('<h2>RESULT of request to Backend service:</h2>OData service response: <p>' + JSON.stringify(accessTokenForDestination) + '</p>');
	// });
	Utils.getJWTTokenForService(destination)
		.then(token => {
			// var oRequiredDestinationMap = oDestinationMapping.filter(function (value) {
			// 	return value.tenant === "47aa380c-4f1d-439f-ab07-5784e5074e8e";
			// });
			// var sDestinameName = oRequiredDestinationMap[0].destination;

			// 1b) call the destination service 
			return _getDestinationConfig("MTAPPDest1", 'Bearer ' + token);
		})
		.then(result => {
			queriedDestination = result.destinationInfo;
			return Utils.getJWTTokenForService(Utils.getServiceByName("connectivity"));
		})
		.then(token => {
			return callViaDestination({
				url: "/sap/opu/odata/sap/ZSA_OPPORTUNITY_ODATA_SRV/OpportunityHeaderSet",
				destination: queriedDestination,
				proxy: "http://connectivityproxy.internal.cf.eu10.hana.ondemand.com:20003",
				proxyAccessToken: String(token),
				contentType: "application/json" || undefined,
				http_method: "GET",
				payload: undefined,
				formData: undefined,
				fullResponse: false,
				techErrorOnly: false,
				binary: false
			});
		}).then(result => {
			res.send('<h2>RESULT of request to Backend service:</h2>OData service response: <p>' + JSON.stringify(result) + '</p>');
		})
		.catch(error => {
			res.send('ERROR: ' + error.message + ' - FULL ERROR: ' + error.error);
		});
});

// app.get('/getProcess', function (req, res) {
// 	console.log(req);

// 	Utils.getJWTTokenForService(destination)
// 		.then(token => {
// 			//	const token = JSON.parse(data).access_token;
// 			const get_options = {
// 				url: destination.uri + '/destination-configuration/v1/destinations/' + requestedDestinationWithoutString,
// 				headers: {
// 					'Authorization': 'Bearer ' + token
// 				}
// 			};

// 			request(get_options, (err, res1, data) => {

// 				/*********************************************************
// 				 ********* Step 4: Access the destination securely *******
// 				 *********************************************************/
// 				var DestinationDetails = JSON.parse(data);

// 				const token = DestinationDetails.authTokens[0];
// 				var DestinationURL = DestinationDetails.destinationConfiguration.URL;
// 				var sEntityUrl = DestinationURL + "/sap/opu/odata/sap/ZEPM_MODEL_ODATA_SRV/ZI_lifecycle_status?sap-client=400&$format=json";

// 				const options = {
// 					method: 'GET',
// 					url: sEntityUrl,
// 					headers: {
// 						'Authorization': `${token.type} ${token.value}`
// 					}
// 				};

// 				var option_string = options.toString();

// 				// request(options).on('data', (s) => {
// 				// 	var responseStr = "<!DOCTYPE HTML><html><head><title>MTApp</title></head><body><h1>MTApp</h1><h2>Welcome " + req.authInfo.userInfo
// 				// 		.givenName +
// 				// 		" " + req.authInfo.userInfo.familyName + "!</h2><p><b>Subdomain:</b> " + req.authInfo.subdomain +
// 				// 		"</p><p><b>Identity Zone:</b> " + req.authInfo
// 				// 		.identityZone + "</p><p><b>TestWithParsing:</b> " + testenv1 + "</p><p><b>TestWithParsing0.tenant:</b> " + testenv3 +
// 				// 		"</p><p><b>requestedResult:</b> " + requestedResultString + "</p><p><b>requestedDestination:</b> " + requestedDestination +
// 				// 		"</p><p><b>VCAPSEervices:</b> " + process.env.VCAP_SERVICES + "</p><p><b>DestinationConfig:</b> " + data + "</p><p><b>Lifecycle:</b> " + s + 
// 				// 		"</p></body></html>";

// 				// 	res.status(200).send(responseStr);
// 				// });

// 				var responseStr = "<!DOCTYPE HTML><html><head><title>MTApp</title></head><body><h1>MTApp</h1><h2>Welcome " + req.authInfo.userInfo
// 					.givenName +
// 					" " + req.authInfo.userInfo.familyName + "!</h2><p><b>Subdomain:</b> " + req.authInfo.subdomain +
// 					"</p><p><b>Identity Zone:</b> " + req.authInfo
// 					.identityZone + "</p><p><b>TestWithParsing:</b> " + testenv1 + "</p><p><b>TestWithParsing0.tenant:</b> " + testenv3 +
// 					"</p><p><b>requestedResult:</b> " + requestedResultString + "</p><p><b>requestedDestination:</b> " + requestedDestination +
// 					"</p><p><b>VCAPSEervices:</b> " + process.env.VCAP_SERVICES + "</p><p><b>DestinationConfig:</b> " + data +
// 					"</p><p><b>EntityUrl:</b> " + option_string +
// 					"</p></body></html>";

// 				res.status(200).send(responseStr);

// 			});
// 			// var uri = {};
// 			// try {
// 			// 	var dest = JSON.stringify(destination);

// 			// 	uri = url.parse(destination.uri + "/destination-configuration/v1/destinations/" + requestedDestinationWithoutString);
// 			// } catch (e) {
// 			// 	console.error("error parsing uri", e);
// 			// 	return;
// 			// }

// 			// var options = {
// 			// 	protocol: uri.protocol,
// 			// 	host: uri.host,
// 			// 	port: uri.port,
// 			// 	path: uri.path,
// 			// 	headers: {}
// 			// };
// 			// options.headers[HEADER_AUTH] = "Bearer " + token;

// 			// console.log("loadDestination options " + uri.protocol + " " + uri.host + " " + uri.port + " " + uri.path + " ");
// 			// var options_string = JSON.stringify(options);
// 			// 	// var responseStr = "<!DOCTYPE HTML><html><head><title>MTApp</title></head><body><h1>MTApp</h1><h2>Welcome " + req.authInfo.userInfo
// 			// 	// 			.givenName +
// 			// 	// 			" " + req.authInfo.userInfo.familyName + "!</h2><p><b>Subdomain:</b> " + req.authInfo.subdomain +
// 			// 	// 			"</p><p><b>Identity Zone:</b> " + req.authInfo
// 			// 	// 			.identityZone + "</p><p><b>TestWithParsing:</b> " + testenv1 + "</p><p><b>TestWithParsing0.tenant:</b> " + testenv3 +
// 			// 	// 			"</p><p><b>requestedResult:</b> " + requestedResultString + "</p><p><b>requestedDestination:</b> " + requestedDestination +
// 			// 	// 			"</p><p><b>VCAPSEervices:</b> " + process.env.VCAP_SERVICES + "</p><p><b>Destination:</b> " + dest + "</p><p><b>Options:</b> " + options_string +"</p><p><b>token:</b> "+ token +
// 			// 	// 			"</p></body></html>";
// 			// 	// 		//	res.status(200).send(responseStr);

// 			// https.get(options, (res_temp) => {
// 			// 	res.setEncoding('utf8');
// 			// 	let data = '';
// 			// 	res_temp.on('data', c => {
// 			// 		console.log("data " + c);
// 			// 		data += c;
// 			// 	});
// 			// 	res_temp.on('end', () => {
// 			// 		try {
// 			// 			var DestinationDetails = JSON.parse(data);
// 			// 			DestinationURL = DestinationDetails.destinationConfiguration.URL;

// 			// 				var responseStr = "<!DOCTYPE HTML><html><head><title>MTApp</title></head><body><h1>MTApp</h1><h2>Welcome " + req.authInfo.userInfo
// 			// 				.givenName +
// 			// 				" " + req.authInfo.userInfo.familyName + "!</h2><p><b>Subdomain:</b> " + req.authInfo.subdomain +
// 			// 				"</p><p><b>Identity Zone:</b> " + req.authInfo
// 			// 				.identityZone + "</p><p><b>TestWithParsing:</b> " + testenv1 + "</p><p><b>TestWithParsing0.tenant:</b> " + testenv3 +
// 			// 				"</p><p><b>requestedResult:</b> " + requestedResultString + "</p><p><b>requestedDestination:</b> " + requestedDestination +
// 			// 				"</p><p><b>VCAPSEervices:</b> " + process.env.VCAP_SERVICES + "</p><p><b>Destination:</b> " + dest + "</p><p><b>Options:</b> " + options_string +"</p><p><b>Data:</b> "+ data +
// 			// 				"</p></body></html>";
// 			// 				res.status(200).send(responseStr);
// 			// 		} catch (e) {
// 			// 			console.error(e);
// 			// 			return;
// 			// 		}
// 			// 	});
// 			// }).on('error', (e) => {
// 			// 	console.error(e);

// 			// });
// 		});
// });

// app.get('/sap/opu/odata', function (req, res) {
// 	console.log(req);
// 	//	var response = JSON.stringify(req);
// 	res.status(200).json(req);
// 	// var requestedResult = testenv1.filter(function (value) {
// 	// 	return value.tenant === "47aa380c-4f1d-439f-ab07-5784e5074e8e";
// 	// });
// 	// var requestedResultString = JSON.stringify(requestedResult);
// 	// var requestedResultParsed = JSON.parse(requestedResultString);
// 	// var requestedDestinationWithoutString = requestedResultParsed[0].destination;
// 	// var requestedDestination = JSON.stringify(requestedResultParsed[0].destination);

// 	// Utils.getJWTTokenForService(destination)
// 	// 	.then(token => {
// 	// 		//	const token = JSON.parse(data).access_token;
// 	// 		const get_options = {
// 	// 			url: destination.uri + '/destination-configuration/v1/destinations/' + requestedDestinationWithoutString,
// 	// 			headers: {
// 	// 				'Authorization': 'Bearer ' + token
// 	// 			}
// 	// 		}

// 	// 		request(get_options, (err, res1, data) => {

// 	// 			/*********************************************************
// 	// 			 ********* Step 4: Access the destination securely *******
// 	// 			 *********************************************************/
// 	// 			var DestinationDetails = JSON.parse(data);

// 	// 			const token = DestinationDetails.authTokens[0];
// 	// 			var DestinationURL = DestinationDetails.destinationConfiguration.URL;
// 	// 			var sEntityUrl = DestinationURL + "/sap/opu/odata/sap/ZEPM_MODEL_ODATA_SRV/ZI_lifecycle_status?sap-client=400&$format=json"

// 	// 			const options = {
// 	// 				method: 'GET',
// 	// 				url: sEntityUrl,
// 	// 				headers: {
// 	// 					'Authorization': `${token.type} ${token.value}`
// 	// 				}
// 	// 			};

// 	// 			var option_string = options.toString();

// 	// 			// request(options).on('data', (s) => {
// 	// 			// 	var responseStr = "<!DOCTYPE HTML><html><head><title>MTApp</title></head><body><h1>MTApp</h1><h2>Welcome " + req.authInfo.userInfo
// 	// 			// 		.givenName +
// 	// 			// 		" " + req.authInfo.userInfo.familyName + "!</h2><p><b>Subdomain:</b> " + req.authInfo.subdomain +
// 	// 			// 		"</p><p><b>Identity Zone:</b> " + req.authInfo
// 	// 			// 		.identityZone + "</p><p><b>TestWithParsing:</b> " + testenv1 + "</p><p><b>TestWithParsing0.tenant:</b> " + testenv3 +
// 	// 			// 		"</p><p><b>requestedResult:</b> " + requestedResultString + "</p><p><b>requestedDestination:</b> " + requestedDestination +
// 	// 			// 		"</p><p><b>VCAPSEervices:</b> " + process.env.VCAP_SERVICES + "</p><p><b>DestinationConfig:</b> " + data + "</p><p><b>Lifecycle:</b> " + s + 
// 	// 			// 		"</p></body></html>";

// 	// 			// 	res.status(200).send(responseStr);
// 	// 			// });

// 	// 			var responseStr = "<!DOCTYPE HTML><html><head><title>MTApp</title></head><body><h1>MTApp</h1><h2>Welcome " + req.authInfo.userInfo
// 	// 				.givenName +
// 	// 				" " + req.authInfo.userInfo.familyName + "!</h2><p><b>Subdomain:</b> " + req.authInfo.subdomain +
// 	// 				"</p><p><b>Identity Zone:</b> " + req.authInfo
// 	// 				.identityZone + "</p><p><b>TestWithParsing:</b> " + testenv1 + "</p><p><b>TestWithParsing0.tenant:</b> " + testenv3 +
// 	// 				"</p><p><b>requestedResult:</b> " + requestedResultString + "</p><p><b>requestedDestination:</b> " + requestedDestination +
// 	// 				"</p><p><b>VCAPSEervices:</b> " + process.env.VCAP_SERVICES + "</p><p><b>DestinationConfig:</b> " + data + "</p><p><b>EntityUrl:</b> " + option_string + 
// 	// 				"</p></body></html>";

// 	// 			res.status(200).send(responseStr);

// 	// 		});
// 	// 	});
// });

// app.get('"/sap/opu/odata/sap/ZSA_OPPORTUNITY_ODATA_SRV/', function (req, res) {
// 	console.log(req);
// 	res.status(200).json(req);
// 	// var requestedResult = testenv1.filter(function (value) {
// 	// 	return value.tenant === "47aa380c-4f1d-439f-ab07-5784e5074e8e";
// 	// });
// 	// var requestedResultString = JSON.stringify(requestedResult);
// 	// var requestedResultParsed = JSON.parse(requestedResultString);
// 	// var requestedDestinationWithoutString = requestedResultParsed[0].destination;
// 	// var requestedDestination = JSON.stringify(requestedResultParsed[0].destination);

// 	// Utils.getJWTTokenForService(destination)
// 	// 	.then(token => {
// 	// 		//	const token = JSON.parse(data).access_token;
// 	// 		const get_options = {
// 	// 			url: destination.uri + '/destination-configuration/v1/destinations/' + requestedDestinationWithoutString,
// 	// 			headers: {
// 	// 				'Authorization': 'Bearer ' + token
// 	// 			}
// 	// 		}

// 	// 		request(get_options, (err, res1, data) => {

// 	// 			/*********************************************************
// 	// 			 ********* Step 4: Access the destination securely *******
// 	// 			 *********************************************************/
// 	// 			var DestinationDetails = JSON.parse(data);

// 	// 			const token = DestinationDetails.authTokens[0];
// 	// 			var DestinationURL = DestinationDetails.destinationConfiguration.URL;
// 	// 			var sEntityUrl = DestinationURL + "/sap/opu/odata/sap/ZEPM_MODEL_ODATA_SRV/ZI_lifecycle_status?sap-client=400&$format=json"

// 	// 			const options = {
// 	// 				method: 'GET',
// 	// 				url: sEntityUrl,
// 	// 				headers: {
// 	// 					'Authorization': `${token.type} ${token.value}`
// 	// 				}
// 	// 			};

// 	// 			var option_string = options.toString();

// 	// 			// request(options).on('data', (s) => {
// 	// 			// 	var responseStr = "<!DOCTYPE HTML><html><head><title>MTApp</title></head><body><h1>MTApp</h1><h2>Welcome " + req.authInfo.userInfo
// 	// 			// 		.givenName +
// 	// 			// 		" " + req.authInfo.userInfo.familyName + "!</h2><p><b>Subdomain:</b> " + req.authInfo.subdomain +
// 	// 			// 		"</p><p><b>Identity Zone:</b> " + req.authInfo
// 	// 			// 		.identityZone + "</p><p><b>TestWithParsing:</b> " + testenv1 + "</p><p><b>TestWithParsing0.tenant:</b> " + testenv3 +
// 	// 			// 		"</p><p><b>requestedResult:</b> " + requestedResultString + "</p><p><b>requestedDestination:</b> " + requestedDestination +
// 	// 			// 		"</p><p><b>VCAPSEervices:</b> " + process.env.VCAP_SERVICES + "</p><p><b>DestinationConfig:</b> " + data + "</p><p><b>Lifecycle:</b> " + s + 
// 	// 			// 		"</p></body></html>";

// 	// 			// 	res.status(200).send(responseStr);
// 	// 			// });

// 	// 			var responseStr = "<!DOCTYPE HTML><html><head><title>MTApp</title></head><body><h1>MTApp</h1><h2>Welcome " + req.authInfo.userInfo
// 	// 				.givenName +
// 	// 				" " + req.authInfo.userInfo.familyName + "!</h2><p><b>Subdomain:</b> " + req.authInfo.subdomain +
// 	// 				"</p><p><b>Identity Zone:</b> " + req.authInfo
// 	// 				.identityZone + "</p><p><b>TestWithParsing:</b> " + testenv1 + "</p><p><b>TestWithParsing0.tenant:</b> " + testenv3 +
// 	// 				"</p><p><b>requestedResult:</b> " + requestedResultString + "</p><p><b>requestedDestination:</b> " + requestedDestination +
// 	// 				"</p><p><b>VCAPSEervices:</b> " + process.env.VCAP_SERVICES + "</p><p><b>DestinationConfig:</b> " + data + "</p><p><b>EntityUrl:</b> " + option_string + 
// 	// 				"</p></body></html>";

// 	// 			res.status(200).send(responseStr);

// 	// 		});
// 	// 	});
// });

var server = require("http").createServer();
var port = process.env.PORT || 3000;

server.on("request", app);

server.listen(port, function () {
	console.info("Backend: " + server.address().port);
});