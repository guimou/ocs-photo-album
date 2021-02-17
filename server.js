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
const s3Endpoint = process.env.S3_ENDPOINT;
// AWS.config.logger = console; // Debug purposes
AWS.config.update({
  region: '',
  sslEnabled: (process.env.S3_ENDPOINT.includes('https') ? true : false),
  s3ForcePathStyle: true,
  signatureVersion: 'v4'
});


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
  let data = fs.readFileSync(path.join(service_account_path, 'namespace'), 'utf8');
  namespace = data.trim();
  kc.loadFromDefault();
}

const api_client = kc.makeApiClient(k8s.CoreV1Api);
const api_client_custom = kc.makeApiClient(k8s.CustomObjectsApi);


function escape(text) {
  return text.replace(/[^a-zA-Z0-9]+/g, "-")
}


const sleep = (milliseconds) => {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function get_bucket_config_maps() {
  let target_label = 'bucket-provisioner=openshift-storage.ceph.rook.io-bucket';
  const config_maps_list = await api_client.listNamespacedConfigMap(namespace, null, null, null, null, target_label).then((res) => {
    let config_maps = res.body;
    let config_maps_list = [];
    for (var i = 0; i < config_maps.items.length; i++) {
      config_maps_list.push(config_maps.items[i].metadata.name)
    }
    console.log(`Found these Config Maps: ${config_maps_list}`);
    return config_maps_list
  })
    .catch((err) => {
      console.log(err)
    })
  return config_maps_list
}

async function get_bucket_info(uid) {
  let data = []
  await api_client.readNamespacedConfigMap('ocs-photo-album-' + uid, namespace).then((res) => {
    let bucket_name = res.body.data["BUCKET_NAME"]
    data.push(bucket_name)
  })
    .catch((err) => {
      //console.log(err)
      console.log('erreur get')
    })
  await api_client.readNamespacedSecret('ocs-photo-album-' + uid, namespace).then((res) => {
    let key = Buffer.from(res.body.data["AWS_ACCESS_KEY_ID"], 'base64').toString()
    let key_secret = Buffer.from(res.body.data["AWS_SECRET_ACCESS_KEY"], 'base64').toString()
    data.push(key)
    data.push(key_secret)
  })
    .catch((err) => {
      //console.log(err)
      console.log('erreur get')
    })
  return data
}


async function create_claim(uid) {
  console.log("create claim");
  let group = 'objectbucket.io'
  let version = 'v1alpha1'
  let plural = 'objectbucketclaims'
  let body = `
    {
    "apiVersion": "objectbucket.io/v1alpha1",
    "kind": "ObjectBucketClaim",
    "metadata": {
      "name": "ocs-photo-album-${uid}"
      },
    "spec": {
      "generateBucketName": "ocs-photo-album-${uid}",
      "storageClassName": "ocs-storagecluster-ceph-rgw"
      }
    }
    `;
  console.log(JSON.parse(body));
  await api_client_custom.createNamespacedCustomObject(group, version, namespace, plural, JSON.parse(body), { pretty: true }).then((res) => {
    console.log('Bucket created')
  })
    .catch((err) => {
      console.log(err)
    })
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
app.get('/cm', async (req, res, next) => {
  let cm_list = await get_bucket_config_maps()
  res.json(cm_list)
})

// API - bucket_info
app.get('/bucket_info/:uid', async (req, res, next) => {
  let data = await get_bucket_info(req.params.uid)
  res.send(data)
})

// API - create_claim
app.get('/create_claim/:uid', async (req, res, next) => {
  await Promise.all([create_claim(req.params.uid), sleep(5000)])
  let data = await get_bucket_info(req.params.uid)
  res.send(data)
})


// API - List bucket content
app.get('/listimages/:uid', async function (req, res, next) {
  let data = await get_bucket_info(req.params.uid)
  AWS.config.update({
    accessKeyId: data[1],
    secretAccessKey: data[2],
  });
  var s3 = new AWS.S3({ endpoint: s3Endpoint });

  s3.listObjectsV2({ Bucket: data[0] }, function (err, data) {
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
app.get('/image/:uid/:id', async function (req, res, next) {
  let data = await get_bucket_info(req.params.uid)
  AWS.config.update({
    accessKeyId: data[1],
    secretAccessKey: data[2],
  });
  var s3 = new AWS.S3({ endpoint: s3Endpoint });

  var s3Stream = s3.getObject({ Bucket: data[0], Key: req.params.id }).createReadStream();
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
app.post('/upload/:uid', async function (req, res) {
  let data = await get_bucket_info(req.params.uid)
  AWS.config.update({
    accessKeyId: data[1],
    secretAccessKey: data[2],
  });
  var s3 = new AWS.S3({ endpoint: s3Endpoint });

  // Upload functions
  var cloudStorage = multerS3({
    s3: s3,
    bucket: data[0],
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