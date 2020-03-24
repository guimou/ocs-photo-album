const express = require('express');
const app = express();
const multer = require('multer');
const multerS3 = require('multer-s3');
const cors = require('cors');
const fs = require('fs');
app.use(cors())
require('dotenv').config();

/**************************/
/* S3 functions           */
/**************************/

// Create the S3 client
const AWS = require('aws-sdk');
// AWS.config.logger = console; // Debug purposes
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
  bucket: process.env.BUCKETNAME,
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

/**************************/
/* Kubernetes functions   */
/**************************/

const k8s = require('@kubernetes/client-node');
const yaml = require('js-yaml');
const kc = new k8s.KubeConfig();
const service_account_path = '/var/run/secrets/kubernetes.io/serviceaccount';
const path = require('path');
var namespace = '';
if (fs.existsSync(service_account_path)) {
  fs.readFileSync(path.join(service_account_path, 'namespace'), (err, data) => {
    if (err) throw err;
    namespace = data.trim();
  });
  kc.loadFromDefault();
}
//const api_client = kc.makeApiClient(k8s.CoreV1Api);
//const api_client_custom = kc.makeApiClient(k8s.CustomObjectsApi);

function get_noobaa_config_maps() {
  let target_label = 'bucket-provisioner=openshift-storage.noobaa.io-obc';
  let config_maps_list = [];
  try {
    var config_maps = api_client.list_namespaced_config_map(namespace, label_selector = target_label)
  }
  catch (err) {
    if (err.status !== '404') {
      console.log(err);
    }
    return config_maps_list
  }
  for (const cm in config_maps.items) {
    config_maps_list.append(cm.metadata.name)
  }
  console.log(`Found these Config Maps: ${config_maps_list}`);
  return config_maps_list
}

/* function read_config_map(config_map_name, key_name = "profiles") {
  try {
    var config_map = api_client.read_namespaced_config_map(config_map_name, namespace)
  }
  catch (err) {
    if (err.status !== '404') {
      console.log(err);
    }
    return {}
  }
  var config_map_yaml = yaml.safe_load(config_map.name)
  return config_map_yaml
} */

function escape(text) {
  return text.replace(/[^a-zA-Z0-9]+/g, "-")
}

function load_keys(claim_name) {
  console.log("load_keys: " + claim_name)
  let config_map = this.api_client.read_namespaced_config_map(claim_name, namespace)
  let bucket_name = this.yaml.safe_load(config_map.data["BUCKET_NAME"])
  console.log(bucket_name)
  let secret = this.api_client.read_namespaced_secret(claim_name, namespace)
  let key = decodeURI(yaml.safe_load(secret.data["AWS_ACCESS_KEY_ID"])).toString('ascii')
  let key_secret = decodeURI(yaml.safe_load(secret.data["AWS_SECRET_ACCESS_KEY"])).toString('ascii')
  console.log(key)
  return [bucket_name, key, key_secret]
}

const sleep = (milliseconds) => {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function create_claim(username) {
  console.log("create claim");
  let user_bucket_name = ''
  let aws_access_key = ''
  let aws_secret_access_key = ''
  let group = 'objectbucket.io'
  let version = 'v1alpha1'
  let plural = 'objectbucketclaims'
  let body = `
    {
    "apiVersion": "objectbucket.io/v1alpha1",
    "kind": "ObjectBucketClaim",
    "metadata": {
      "name": "odh-bucket-' + username + '"
      },
    "spec": {
      "generateBucketName": "odh",
      "storageClassName": "openshift-storage.noobaa.io"
      }
    }
    `;
  console.log(JSON.parse(body));
  let pretty = true;
  try {
    api_response = api_client_custom.create_namespaced_custom_object(group, version, namespace, plural, JSON.parse(body), pretty = pretty)
    console.log(api_response)
  }
  catch (err) {
    console.log(`Exception when calling CustomObjectsApi->create_namespaced_custom_object: ${err}\n`);
  }
  var cm_name = "odh-bucket-" + username
  var attempts = 0
  while (attempts < 5) {
    try {
      [user_bucket_name, aws_access_key, aws_secret_access_key] = load_keys(cm_name)
    }
    catch {
      attempts += 1
      sleep(2000).then(() => {
        console.log("retry");
      })
    }
  }
  return [user_bucket_name, aws_access_key, aws_secret_access_key]
}

/**************************/
/* API section            */
/**************************/

// API - test
app.get('/hello', function (req, res) {
  return res.send('Hello Server')
})
// API - escape test
app.get('/escape/:text', function (req, res) {
  return res.send(escape(req.params.text))
})

// API - get config_maps test
app.get('/cm', function (req, res) {
  return res.send(get_noobaa_config_maps())
})

// API - claim name test
app.get('/claime/:claimname', function (req, res) {
  return res.send(load_keys(req.params.claimname))
})

// API - List bucket content
app.get('/listimages', function (req, res, next) {
  s3.listObjectsV2({ Bucket: process.env.BUCKETNAME }, function (err, data) {
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
  var s3Stream = s3.getObject({ Bucket: process.env.BUCKETNAME, Key: req.params.id }).createReadStream();
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


// API - upload images
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

app.use(express.static(path.join(__dirname, '/build')));

app.listen(process.env.LISTEN_PORT, function () {
  console.log(`App running on port ${process.env.LISTEN_PORT}`);
});