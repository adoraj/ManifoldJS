'use strict';

var tools = require('../lib/tools');
var path = require('path');
var fs = require('fs');
var should = require('should');
var http = require('http');
var url = require('url');

var responseFunction;

var server = http.createServer(function (req, res) {
  if (responseFunction) {
    responseFunction(req, res);
  } else {
    res.writeHead(404);
    res.end();
  }
});

var assetsDirectory = path.join(__dirname, 'assets');

var inputFiles = {
  notExistingFile: path.join(assetsDirectory, 'notExistingFile.json'),
  invalidManifest: path.join(assetsDirectory, 'invalid.json'),
  invalidManifestFormat: path.join(assetsDirectory, 'invalidManifestFormat.json'),
  validManifest: path.join(assetsDirectory, 'manifest.json')
};

var outputFiles = {
  invalidManifestPath: path.join(assetsDirectory, 'notExistingDirectory', 'notExistingFile.json'),
  validManifestPath: path.join(assetsDirectory, 'output-manifest.json')
};

describe('Tools', function () {
  describe('getManifestFromFile()', function () {
    it('Should return an Error if path is invalid', function (done) {
      tools.getManifestFromFile(inputFiles.notExistingFile, function (err){
        should.exist(err);
        done();
      });
    });

    it('Should return an Error if JSON format is invalid', function (done) {
      tools.getManifestFromFile(inputFiles.invalidManifest, function (err){
        should.exist(err);
        err.should.have.property('message', 'Invalid manifest format');
        done();
      });
    });

    it('Should return an Error if manifest format is invalid', function (done) {
      tools.getManifestFromFile(inputFiles.invalidManifestFormat, function (err){
        should.exist(err);
        err.should.have.property('message', 'Invalid manifest format');
        done();
      });
    });

    it('Should return a manifest object if input manifest is valid', function (done) {
      tools.getManifestFromFile(inputFiles.validManifest, function(err, manifestInfo){
        should.not.exist(err);
        should.exist(manifestInfo);
        manifestInfo.should.have.property('content');
        done();
      });
    });
  });

  describe('writeToFile()', function () {
    it('Should return an Error if manifest info is undefined', function (done) {
      tools.writeToFile(undefined, outputFiles.invalidManifestPath, function (err){
        should.exist(err);
        err.should.have.property('message', 'Manifest content is empty or invalid.');
        done();
      });
    });

    it('Should return an Error if content property is undefined', function (done) {
      tools.writeToFile({ key: 'value' }, outputFiles.invalidManifestPath, function (err){
        should.exist(err);
        err.should.have.property('message', 'Manifest content is empty or invalid.');
        done();
      });
    });

    it('Should return an Error if an error occurs while writing the file', function(done) {
      tools.writeToFile({ content: { 'start_url': 'url' } }, outputFiles.invalidManifestPath, function(err){
        should.exist(err);
        done();
      });
    });

    it('Should write only the manifest information object content in file', function(done) {
      tools.writeToFile({ content: { 'start_url': 'url' } }, outputFiles.validManifestPath, function(err){
        should.not.exist(err);
        done();
      });
    });

    after(function() {
      // runs after all tests in this block

      fs.exists(outputFiles.validManifestPath, function (exists) {
        if(exists) {
          fs.unlink(outputFiles.validManifestPath, function (err) {
            if (err) {
              throw err;
            }
          });
        }
      });
    });
  });

  describe('getManifestUrlFromSite()', function () {
    before(function () {
      server.listen(8042);
    });

    it('Should return an Error if url is invalid', function(done) {
      responseFunction = function() {
        should.fail('This function should not be called in this test');
      };

      tools.getManifestUrlFromSite('invalid url', function(err) {
        should.exist(err);
        err.should.have.property('message', 'Failed to retrieve manifest from site.');
        done();
      });
    });

    it('Should return an Error if server returns 404', function(done) {
      responseFunction = function(req, res) {
        res.writeHead(404);
        res.end();
      };

      tools.getManifestUrlFromSite('http://localhost:8042/notfound', function(err) {
        should.exist(err);
        err.should.have.property('message', 'Failed to retrieve manifest from site.');
        done();
      });
    });

    it('Should return undefined if no manifest tag is found', function(done) {
      responseFunction = function(req, res) {
        res.writeHead(200, { 'Content-Type': 'text/html' });

        res.end('<!doctype>' +
                '<html>' +
                  '<head>' +
                    '<title>test</title>' +
                  '</head>' +
                  '<body></body>' +
                '</html>');
      };

      tools.getManifestUrlFromSite('http://localhost:8042/urlWithoutManifestTag', function(err, manifestUrl) {
        should.not.exist(err);
        should.not.exist(manifestUrl);
        done();
      });
    });

    it('Should return the manifest url if the manifest tag has a relative url', function(done) {
      responseFunction = function(req, res) {
        res.writeHead(200, { 'Content-Type': 'text/html' });

        res.end('<!doctype>' +
                '<html>' +
                  '<head>' +
                    '<title>test</title>' +
                    '<link rel="manifest" href="manifest.json">' +
                  '</head>' +
                  '<body></body>' +
                '</html>');
      };

      tools.getManifestUrlFromSite('http://localhost:8042/urlWithManifestTag', function(err, manifestUrl) {
        should.not.exist(err);
        should.exist(manifestUrl);
        manifestUrl.should.be.equal('http://localhost:8042/manifest.json');
        done();
      });
    });

    it('Should return the manifest url if the manifest tag has an absolute url', function(done) {
      responseFunction = function(req, res) {
        res.writeHead(200, { 'Content-Type': 'text/html' });

        res.end('<!doctype>' +
                '<html>' +
                  '<head>' +
                    '<title>test</title>' +
                    '<link rel="manifest" href="http://www.contoso.com/manifest.json">' +
                  '</head>' +
                  '<body></body>' +
                '</html>');
      };

      tools.getManifestUrlFromSite('http://localhost:8042/urlWithManifestTag', function(err, manifestUrl) {
        should.not.exist(err);
        should.exist(manifestUrl);
        manifestUrl.should.be.equal('http://www.contoso.com/manifest.json');
        done();
      });
    });

    afterEach(function () {
      responseFunction = undefined;
    });

    after(function () {
      server.close();
    });
  });

  describe('downloadManifestFromUrl()', function () {
    before(function () {
      server.listen(8042);
    });

    it('Should return an Error if url is invalid', function(done) {
      responseFunction = function() {
        should.fail('This function should not be called in this test');
      };

      tools.downloadManifestFromUrl('invalid url', function(err) {
        should.exist(err);
        err.should.have.property('message', 'Failed to download manifest data.');
        done();
      });
    });

    it('Should return an Error if server returns 404', function(done) {
      responseFunction = function(req, res) {
        res.writeHead(404);
        res.end();
      };

      tools.downloadManifestFromUrl('http://localhost:8042/notfound', function(err) {
        should.exist(err);
        err.should.have.property('message', 'Failed to download manifest data.');
        done();
      });
    });

    it('Should return an Error if downloaded manifest is invalid', function(done) {
      responseFunction = function(req, res) {
        res.writeHead(200, { 'Content-Type': 'application/json' });

        res.end('invalid json');
      };

      tools.downloadManifestFromUrl('http://localhost:8042/invalidJson', function(err) {
        should.exist(err);
        err.should.have.property('message', 'Invalid manifest format.');
        done();
      });
    });

    it('Should return the manifest info object from a site', function(done) {
      responseFunction = function(req, res) {
        res.writeHead(200, { 'Content-Type': 'application/json' });

        res.end(JSON.stringify({'start_url': 'http://www.contoso.com/'}));
      };

      tools.downloadManifestFromUrl('http://localhost:8042/validManifest.json', function(err, manifestInfo) {
        should.not.exist(err);
        should.exist(manifestInfo);
        manifestInfo.should.have.properties('content', 'format');
        done();
      });
    });

    afterEach(function () {
      responseFunction = undefined;
    });

    after(function () {
      server.close();
    });
  });

  describe('getManifestFromSite()', function () {
    before(function () {
      server.listen(8042);
    });

    it('Should return an Error if url is invalid', function(done) {
      responseFunction = function() {
        should.fail('This function should not be called in this test');
      };

      tools.getManifestFromSite('invalid url', function(err) {
        should.exist(err);
        err.should.have.property('message', 'Failed to retrieve manifest from site.');
        done();
      });
    });

    it('Should return an Error if server returns 404', function(done) {
      responseFunction = function(req, res) {
        res.writeHead(404);
        res.end();
      };

      tools.getManifestFromSite('http://localhost:8042/notfound', function(err) {
        should.exist(err);
        err.should.have.property('message', 'Failed to retrieve manifest from site.');
        done();
      });
    });

    it('Should return the manifest info object from a site', function(done) {
      responseFunction = function(req, res) {
        var url_parts = url.parse(req.url);
        var route = url_parts.pathname;

        if (route === '/manifest.json') {
          res.writeHead(200, { 'Content-Type': 'application/json' });

          res.end(JSON.stringify({'start_url': 'http://www.contoso.com/'}));
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });

          res.end('<!doctype>' +
          '<html>' +
            '<head>' +
              '<title>test</title>' +
              '<link rel="manifest" href="http://localhost:8042/manifest.json">' +
            '</head>' +
            '<body></body>' +
          '</html>');
        }
      };

      tools.getManifestFromSite('http://localhost:8042/urlWithManifestTag', function(err, manifestInfo) {
        should.not.exist(err);
        should.exist(manifestInfo);
        manifestInfo.should.have.properties('content', 'format');
        manifestInfo.content.should.have.property('start_url', 'http://www.contoso.com/');
        done();
      });
    });

    it('Should create a manifest info object if no manifest tag is found', function(done) {
      responseFunction = function(req, res) {
        res.writeHead(200, { 'Content-Type': 'text/html' });

        res.end('<!doctype>' +
        '<html>' +
          '<head>' +
            '<title>test</title>' +
          '</head>' +
          '<body></body>' +
        '</html>');
      };

      var siteUrl ='http://localhost:8042/urlWithoutManifestTag';

      tools.getManifestFromSite(siteUrl, function(err, manifestInfo) {
        should.not.exist(err);
        should.exist(manifestInfo);
        manifestInfo.should.have.properties('content', 'format');
        manifestInfo.content.should.have.property('start_url', siteUrl);
        done();
      });
    });

    afterEach(function () {
      responseFunction = undefined;
    });

    after(function () {
      server.close();
    });
  });

  describe('convertTo()', function () {
    it('Should return an Error if manifest info is undefined', function(done) {
      tools.convertTo(undefined, 'W3C', function(err){
        should.exist(err);
        err.should.have.property('message', 'Manifest content is empty or not initialized.');
        done();
      });
    });

    it('Should return an Error if content property is undefined', function(done) {
      tools.convertTo({ key: 'value' }, 'W3C', function(err) {
        should.exist(err);
        err.should.have.property('message', 'Manifest content is empty or not initialized.');
        done();
      });
    });

    it('Should return the same object if the format is the same', function (done) {
      var manifestInfo = { content: { 'start_url': 'url' }, format: 'W3C' };
      tools.convertTo(manifestInfo, 'W3C', function(err, result) {
        should.not.exist(err);
        result.should.be.exactly(manifestInfo);
        done();
      });
    });

    it('Should use w3c as default format', function (done) {
      var manifestInfo = { content: { 'start_url': 'url' } };
      tools.convertTo(manifestInfo, undefined, function(err, result) {
        should.not.exist(err);
        result.should.be.exactly(manifestInfo);
        result.should.have.property('format', 'w3c');
        done();
      });
    });

    it('Should return an Error if input format is invalid', function(done) {
      var manifestInfo = { content: { 'start_url': 'url' }, format: 'invalid format' };
      tools.convertTo(manifestInfo, 'W3C', function(err) {
        should.exist(err);
        err.should.have.property('message', 'Manifest format is not recognized.');
        done();
      });
    });

    it('Should return an Error if output format is invalid', function(done) {
      var manifestInfo = { content: { 'start_url': 'url' }, format: 'W3C' };
      tools.convertTo(manifestInfo, 'invalid format', function(err) {
        should.exist(err);
        err.should.have.property('message', 'Manifest format is not recognized.');
        done();
      });
    });

    it('Convert from W3C to chromeOS.');
    it('Convert from chromeOS to W3C.');
  });
});
