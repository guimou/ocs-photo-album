import React, { Component } from 'react';
import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Form from 'react-bootstrap/Form';
import ProgressBar from 'react-bootstrap/ProgressBar';
import Button from 'react-bootstrap/Button';
import FormGroup from 'react-bootstrap/FormGroup';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Image from 'react-bootstrap/Image';
import Carousel from 'react-bootstrap/Carousel';
import { v4 as uuidv4 } from 'uuid';


class App extends Component {

  constructor(props) {
    super(props);
    this.state = {
      uid: null,
      selectedFile: null,
      loaded: 0,
      slides: []
    }
  }

  async createUser() {
    var uid = ''
    uid = uuidv4()
    localStorage.setItem('ocsphotoid', uid)
    await axios.get("/create_claim/" + uid)
    return uid
  }

  async identifyUser() {
    var uid = '';
    let stored_uid = localStorage.getItem('ocsphotoid');
    if (stored_uid && (stored_uid !== '')) {
      uid = stored_uid;
    } else {
      uid = await this.createUser()
    }
    return uid
  }

  async componentDidMount() {
    var uid = await this.identifyUser()
    this.setState({ uid: uid }, () => {
      console.log(this.state.uid)
      this.loadImagesList(this.state.uid);
    })
  }

  updateSlides(imagesList) {
    if (imagesList.length !== 0) {
      this.setState({
        slides: imagesList
      });
    }
  }

  loadImagesList(uid) {
    axios.get("/bucket_info/" + uid)
      .then(res => {
        console.log(res.data)
        toast.info('Your bucket is: ' + res.data[0])
      })
      .catch(err => { // then print response status
        toast.error('There is a problem with your bucket, see the console for error.')
        console.log(err)
        return
      })
    axios.get("/listimages/" + uid)
      .then(res => {
        console.log(res.data)
        this.updateSlides(res.data)
      })
      .catch(err => { // then print response status
        toast.error('Cannot get images list, see the console for error.')
        console.log(err)
      })
  }

  checkMimeType = (event) => {
    //getting file object
    let files = event.target.files
    //define message container
    let err = []
    // list allow mime type
    const types = ['image/png', 'image/jpeg', 'image/gif']
    // loop access array
    for (let x = 0; x < files.length; x++) {
      // compare file type find doesn't matach
      if (types.every(type => files[x].type !== type)) {
        // create error message and assign to container   
        err[x] = files[x].type + ' is not a supported format\n';
      }
    };
    for (var z = 0; z < err.length; z++) {// if message not same old that mean has error 
      // discard selected file
      toast.error(err[z])
      event.target.value = null
    }
    return true;
  }

  maxSelectFile = (event) => {
    let files = event.target.files
    if (files.length > 3) {
      const msg = 'Only 3 images can be uploaded at a time'
      event.target.value = null
      toast.warn(msg)
      return false;
    }
    return true;
  }

  checkFileSize = (event) => {
    let files = event.target.files
    let size = 2000000
    let err = [];
    for (var x = 0; x < files.length; x++) {
      if (files[x].size > size) {
        err[x] = files[x].type + 'is too large, please pick a smaller file\n';
      }
    };
    for (var z = 0; z < err.length; z++) {// if message not same old that mean has error 
      // discard selected file
      toast.error(err[z])
      event.target.value = null
    }
    return true;
  }

  onChangeHandler = event => {
    var files = event.target.files
    if (this.maxSelectFile(event) && this.checkMimeType(event) && this.checkFileSize(event)) {
      // if return true allow to setState
      this.setState({
        selectedFile: files,
        loaded: 0
      })
    }
  }

  onClickHandler = () => {
    const data = new FormData()
    if (this.state.selectedFile !== null) {
      for (var x = 0; x < this.state.selectedFile.length; x++) {
        data.append('file', this.state.selectedFile[x])
      }
      axios.post("/upload/" + this.state.uid, data, {
        onUploadProgress: ProgressEvent => {
          this.setState({
            loaded: (ProgressEvent.loaded / ProgressEvent.total * 100),
          })
        },
      })
        .then(res => { // then print response status
          toast.success('upload success')
          axios.get("/listimages/" + this.state.uid)
            .then(res => {
              console.log(res.data)
              this.updateSlides(res.data)
            })
            .catch(err => { // then print response status
              toast.error('Cannot get images list, see the console for error.')
              console.log(err)
            })
        })
        .catch(err => { // then print response status
          toast.error('upload fail')
          console.log(err)
        })
    } else {
      toast.warn('Select a file first...')
    }

  }

  render() {
    if (!this.state.uid) {
      return <div />
    }

    // uid has been set, do a normal render
    return (
      <Container className="background">
        <Row>
          <Col xs={8}><h2>Welcome to your Photo Album!</h2>
            <p>
              The first time you upload a picture (png, jpg, gif, less than 2MB), a dedicated bucket will be created for you, and the images will be stored there.
              When you reconnect, you'll be automatically linked to this bucket, and you can continue to upload pictures.<br />
              This basic "authentication" works with a cookie, so if you clear it, you'll simply loose access. In a real application, an authentication mechanism would allow for proper reconnection.<br />
              The buckets and their content are automatically deleted after 24 hours.
            </p></Col>
          <Col><Form>
            <FormGroup>
              <Form.Label>Upload Your File </Form.Label>
              <Form.Control type="file" multiple onChange={this.onChangeHandler}></Form.Control>
            </FormGroup>
            <ToastContainer />
            <FormGroup>
              <ProgressBar className="prog" max="100" color="success" value={this.state.loaded} >{Math.round(this.state.loaded, 2)}%</ProgressBar>
            </FormGroup>
            <Button type="button" className="btn btn-success btn-block" onClick={this.onClickHandler}>Upload</Button>
          </Form></Col>
        </Row>
        <Row>
          <Col>&nbsp;</Col>
        </Row>
        <Row>
          <Col></Col>
          <Col xs={10}>
            <h2>And here are your pictures!</h2>
            <Carousel>
              {this.state.slides.map((slide, index) => {
                var link = "/image/" + this.state.uid + "/" + slide
                return (
                  <Carousel.Item>
                    <Image key={index} className="d-block w-50" src={link} rounded />
                  </Carousel.Item>
                );
              })}
            </Carousel>
          </Col>
          <Col></Col>
        </Row>
      </Container>


    );
  }
}


export default App;
