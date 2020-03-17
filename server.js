const express = require('express');
const app = express();
const multer = require('multer')
const cors = require('cors');
app.use(cors())

var storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'public')
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + '-' +file.originalname )
    }
  })
  
var upload = multer({ storage: storage }).array('file')
  
app.get('/hello',function(req,res){
    return res.send('Hello Server')
})

app.post('/upload',function(req, res) {
    
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

app.listen(8080, function() {
    console.log('App running on port 8080');
});