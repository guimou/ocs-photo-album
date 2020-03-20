const express = require('express');
const app = express();
const multer = require('multer');
const multerS3 = require('multer-s3');
const cors = require('cors');
app.use(cors())
require('dotenv').config();
var uuid = require('node-uuid');

// Create an S3 client
const AWS = require('aws-sdk');
// AWS.config.logger = console;
AWS.config.update({
  region: '',
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
  sslEnabled: (process.env.S3_ENDPOINT.includes('https') ? true : false),
  s3ForcePathStyle: true,
  signatureVersion: 'v4'
});
const s3Endpoint = process.env.S3_ENDPOINT;
var s3 = new AWS.S3({ endpoint: s3Endpoint });


// Upload functions
var cloudStorage = multerS3({
  s3: s3,
  bucket: "demo-photoalbum",
  contentType: multerS3.AUTO_CONTENT_TYPE,
  metadata: function (request, file, ab_callback) {
    ab_callback(null, { fieldname: file.fieldname });
  },
  key: function (request, file, ab_callback) {
    var newFileName = Date.now() + "-" + file.originalname;
    ab_callback(null, newFileName);
  },
});

var upload = multer({ storage: cloudStorage }).array('file');


// API - test
app.get('/hello', function (req, res) {
  return res.send('Hello Server')
})

// API - List bucket content
app.get('/listimages/:bucket', function (req, res, next) {
  s3.listObjectsV2({ Bucket: req.params.bucket }, function (err, data) {
    if (err) {
      console.log(err, err.stack); // an error occurred
      res.send(err)
    }
    else {
      console.log(data);           // successful response
      let images = data.Contents.map(a => a.Key);
      res.send(images);
    }
  });
})

// API - get image
app.get('/image/:id', function (req, res, next) {
  var s3Stream = s3.getObject({ Bucket: 'demo-photoalbum', Key: req.params.id }).createReadStream();
  // Listen for errors returned by the service
  s3Stream.on('error', function (err) {
    // NoSuchKey: The specified key does not exist
    console.error(err);
  });

  s3Stream.pipe(res).on('error', function (err) {
    // capture any errors that occur when writing data to the file
    console.error('File Stream:', err);
  }).on('close', function () {
    console.log('Done.');
  });
})

app.post('/upload', function (req, res) {
  upload(req, res, function (err) {

    if (err instanceof multer.MulterError) {
      console.log(err)
      return res.status(500).json(err)
      // A Multer error occurred when uploading.
    } else if (err) {
      console.log(err)
      return res.status(500).json(err)
      // An unknown error occurred when uploading.
    }

    return res.status(200).send(req.file)
    // Everything went fine.
  })
});

app.listen(process.env.LISTEN_PORT, function () {
  console.log(`App running on port ${process.env.LISTEN_PORT}`);
});