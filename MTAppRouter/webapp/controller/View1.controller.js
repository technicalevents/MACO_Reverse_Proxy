sap.ui.define([
	"sap/ui/core/mvc/Controller"
], function (Controller) {
	"use strict";

	return Controller.extend("com.firstui5.controller.View1", {
		onInit: function () {

		},
		onClickButton: function(){
			
			this.getModel().read("/OpportunityHeaderSet",{
				success: function(oResult){
					console.log(oResult);
				},
				error: function(oError){
					console.log(oError);
				}
			});
			
			
		}
	});
});