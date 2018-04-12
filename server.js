"use strict"
const request = require('request');
const dateTime = require('node-datetime');
const fs = require('fs');
const EMA = require('technicalindicators').EMA

// Settings
var market = "USDT_BTC";
var _period = 300;			// 300 = 5min, 900 = 15min
var smallEMA = 8;
var bigEMA = 21;
var interval = 5000;		// How often to request chart data. 1000 = 1 second
var stopLoss = -1.0;		// % max risk
var backOffPeriod = 50;		// Number of intervals before buying again
var profitThreshold = 0.1;	// minimum % profit to validate sell
var dataSpread = 5;			// Multiplied with candles to fetch more data, to higher the more accurate

// Do not change
var smallTimeSpan = _period*(smallEMA*dataSpread)+_period;
var bigTimeSpan = _period*(bigEMA*dataSpread)+_period;
var boughtPrice;
var soldPrice;
var lastPrice = 0.0;
var bought = false;
var sold = false;
var overallProfit = 0.0;
var backOffCount = backOffPeriod;
var intervalStart;
var intervalIsBearish;
var intervalIsBullish;
var intervalBackOff;
var previousBullish = true;

var express = require('express'),
  app = express(),
  http = require('http'),
  httpServer = http.Server(app);

	app.use(express.static(__dirname + '/js'));

	app.get('/', function(req, res) {
	  res.sendFile(__dirname + '/index.html');
	});

	var stream = fs.createWriteStream(process.cwd()+ "/log_" + smallEMA + "ema_" + bigEMA + "ema" + ".txt", {flags:'a'});
	var dt = dateTime.create();
	var formatted = dt.format('Y-m-d H:M:S');
	writeToFile("Settings:\n");
	writeToFile("Market: " + market + "\n");
	writeToFile("Period: " + _period + "\n");
	writeToFile("smallEMA: " + smallEMA + "\n");
	writeToFile("bigEMA: " + bigEMA + "\n");
	writeToFile("Interval: " + interval + "\n");
	writeToFile("Date: " + formatted + "\n\n");

	start();
	
	function start() {
		Bullish(function(response){
			//console.log(response);
			if (response) {
				intervalStart = setInterval(function() {
					//console.log("Is Bullish");
					Bullish(function(response2){
						if (!response2) {
							clearInterval(intervalStart);
							backOff();
							//backOffBeforeIsBearish();		// Went from bullish to bearish, wait a bit for confirmation
							//isBearish();
						}
					})
				}, interval);	
			} else
				isBearish();
		})
	}

	function isBearish() {
		intervalIsBearish = setInterval(function(){
			//console.log("Is Bearish");
			Bullish(function(response){
				if (response && !bought) {
					getLowestAsk(function(response2) {
						if (response2 == -1) {
							skip();
						} else {
							boughtPrice = response2;
							var dt = dateTime.create();
							var formatted = dt.format('Y-m-d H:M:S');
							console.log("");
							console.log(formatted + " | Bought at: " + boughtPrice);
							console.log("");
							writeToFile(formatted + " | Bought at: " + boughtPrice + "\n");
							//writeToFile();
							bought = true;
							sold = false;
							clearInterval(intervalIsBearish);
							isBullish();
						}
					})
				}
			})
			function skip() {
				console.log("Skipping.. poloniex api error");
			}
		}, interval);
	}	

	function isBullish() {
		intervalIsBullish = setInterval(function(){
			//console.log("Is Bullish");
			//writeToFile("Is Bullish\n");
			Bullish(function(response){
				getLastPrice(function(last) {
					if (last == -1) {
						skip();
					} else {
						var tempProfit = (((last/boughtPrice)-1) * 100);
						console.log("Temp Profit: " + tempProfit + "%");
						if (((!response && tempProfit >= profitThreshold) || tempProfit <= stopLoss) && !sold ) {
							getHighestBid(function(response2) {
								if (response2 == -1) {
									skip();
								} else {
									soldPrice = response2;
									var dt = dateTime.create();
									var formatted = dt.format('Y-m-d H:M:S');
									var profit = (((soldPrice/boughtPrice)-1) * 100);

									if (profit < stopLoss)
										profit = stopLoss;

									overallProfit += profit;
									console.log("");
									console.log(formatted + " | Sold at: " + soldPrice);
									console.log(formatted + " | Profit: " + (soldPrice/boughtPrice) + "%");
									console.log("");
									writeToFile(formatted + " | Sold at: " + soldPrice + "\n");
									writeToFile(formatted + " | Profit: " + profit + "%\n");
									writeToFile(formatted + " | Overall Profit: " + overallProfit + "%\n\n");
									bought = false;
									sold = true;
									clearInterval(intervalIsBullish);
									//isBearish();
									
									backOff();
								}
							})
						}
					}	
				})	
			})
			function skip() {
				console.log("Skipping.. poloniex api error");
			}
		}, interval);
	}


	function backOff() {
		backOffCount = backOffPeriod;
		intervalBackOff = setInterval(function(){
			if (backOffCount <= 0) {
				clearInterval(intervalBackOff);
				start();
			} else {
				console.log("Backing off. Restart in " + backOffCount);
				backOffCount -= 1;
			}
		}, interval);
	}

	function backOffBeforeIsBearish() {
		backOffCount = backOffPeriod;
		intervalBackOff = setInterval(function(){
			if (backOffCount <= 0) {
				clearInterval(intervalBackOff);
				isBearish();
			} else {
				console.log("Backing off. Restart in " + backOffCount);
				backOffCount -= 1;
			}
		}, interval);
	}


	function writeToFile(text) {

		stream.write(text);
	}

	function Bullish(callback) {
		getLastPrice(function(last) {
			if (last == -1)
				return callback(previousBullish);
			lastPrice = last;
			//console.log("1");
			calculateEMA(smallTimeSpan, _period, smallEMA, function(response) {
				//console.log("2");
				if (response == -1)
					return callback(previousBullish);
				var eightEMA = response;
				console.log(smallEMA + "ema: " + response);
				calculateEMA(bigTimeSpan, _period, bigEMA, function(response2) {
					//console.log("3");
					if (response2 == -1)
						return callback(previousBullish);
					var fiftyFiveEMA = response2;
					console.log(bigEMA + "ema: " + response2);
					if (eightEMA > fiftyFiveEMA) {
						console.log("Is Bullish");
						previousBullish = true;
						return callback(true);
					} else {
						console.log("Is Bearish");
						previousBullish = false;
						return callback(false);
					}
				})		
			})
		})	
	}


	function getLastPrice(callback) {

		var url = "https://poloniex.com/public?command=returnTicker";
		
		request.get(url, (error, response, body) => {
			if (error) {
				console.log("error: " + error);
				//return 0;
				return callback(-1);
			}

			var latestTickerJsonObj;
			var last;

			if(response) {
			    try {
			        latestTickerJsonObj = JSON.parse("[" + body + "]");
			        last = latestTickerJsonObj[0][market].last;
			    } catch(e) {

					console.log(e);
					return callback(-1);
			    }
			}

			return callback(last);
		});
	}


	function getLowestAsk(callback) {
		//console.log("Getting current price..");
		var url = "https://poloniex.com/public?command=returnTicker";
		
		request.get(url, (error, response, body) => {
			if (error) {
				console.log("error: " + error);
				//return 0;
				return callback(-1);
			}

			var latestTickerJsonObj;
			var lowest;

			if(response) {
			    try {
			        latestTickerJsonObj = JSON.parse("[" + body + "]");
			        lowest = latestTickerJsonObj[0][market].lowestAsk;
			    } catch(e) {

					console.log(e);
					return callback(-1);
			    }
			}
			return callback(lowest);
		});
	}

	function getHighestBid(callback) {
		//console.log("Getting current price..");
		var url = "https://poloniex.com/public?command=returnTicker";
		
		request.get(url, (error, response, body) => {
			if (error) {
				console.log("error: " + error);
				//return 0;
				return callback(-1);
			}

			var latestTickerJsonObj;
			var highest;

			if(response) {
			    try {
			        latestTickerJsonObj = JSON.parse("[" + body + "]");
			        highest = latestTickerJsonObj[0][market].highestBid;
			    } catch(e) {

					console.log(e);
					return callback(-1);
			    }
			}

			return callback(highest);

		});
	}

	function calculateEMA(timeSpan, period, candles, callback) {

			//console.log("startA");
			var unix = Math.round(+new Date()/1000) - timeSpan;
			var url =
	  					"https://poloniex.com/public?command=returnChartData&currencyPair=" + market + "&start=" + unix +"&end=9999999999&period=" + period;
			
			request.get(url, (error, response, body) => {
				if (error) {
					console.log("error: " + error);
					return 0;
				}

			var data;
			var test;

			if(response) {
			    try {
			        data = JSON.parse(body);
			        test = data[0].close;
			    } catch(e) {

					console.log(e);
					return callback(-1);
			        //alert(e); // error in the above string (in this case, yes)!
			    }
			}

			var arr = [];

			for (var i = 0; i < data.length; i++ ) {
				if (i == data.length - 1) {
					arr.push(lastPrice);
				} else {
			    	arr.push(parseFloat(data[i].close));
			    }
			}
			
			//console.log("endB");
			return callback(EMA.calculate({period : candles, values : arr}).pop().toFixed(4));

		});
	}

app.listen(3000);