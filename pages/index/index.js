//index.js
//获取应用实例
const app = getApp()

function untransform(h, arr) {
  /** @type {number[][]} */
  const memo = [];

  for (let i = 0; i < arr.length; i += h) {
      for (let j = 0; j < h; j++) {
          if (!memo[j]) {
              memo[j] = [];
          }
          memo[j].push(arr[i + j]);
      }
  }

  return memo;
}

function unrle(arr) {
  const memo = [];
  let j;
  let k;
  let v = false;

  for (j = 0; j < arr.length; j++) {
      for (k = 0; k < arr[j]; k++) {
          memo.push(v ? 1 : 0);
      }
      v = !v;
  }

  return memo;
}

function unleb(s) {
  let m = 0;
  let p = 0;

  /** @type {number} */
  let k;
  /** @type {number} */
  let x;
  let more = false;
  const memo = [];

  m = 0;

  while (s[p]) {
      x = 0;
      k = 0;
      more = true;
      while (more) {
          const c = s[p].charCodeAt(0) - 48;
          x |= (c & 0x1f) << (5 * k);
          more = !!(c & 0x20);
          p++;
          k++;
          if (!more && c & 0x10) {
              x |= -1 << (5 * k);
          }
      }
      if (m > 2) {
          x += memo[m - 2];
      }
      memo[m++] = x;
  }

  return memo;
}

function pipe(initialValue, ...fns) {
  return fns.reduce((memo, fn) => fn(memo), initialValue);
}

function decodeMask(encodedStr, h) {
  return pipe(
      encodedStr,
      unleb,
      unrle,
      untransform.bind(undefined, h)
  );
}

Page({
  data: {
    access_token: '',
    longitude: 0,
    latitude: 0,
    markers: [],
    showMap: true,
    err: 'err',
    src: '',
    canvasWidth: 0,
    canvasHeight: 0,
    pixelRatio: 1,
    btnText: '选择图片',
    zoom: 14,
  },
  //事件处理函数
  chooseImage: function() {
    const _this = this;
    if (this.data.showMap) {
      this.setData({ showMap: false, btnText: '关闭图片' })
    } else {
      this.setData({ btnText: '选择图片', showMap: true, zoom: 16 })
      const marker = this.data.markers[0]
      this.setData({ markers: [Object.assign({}, marker, {
          iconPath: './circle2.png',
          width: 180,
          height: 120,
        })]
      })
      return
    }
    wx.chooseImage({
      count: 1,
      success: ({errMsg, tempFilePaths}) => {
        if (errMsg === 'chooseImage:ok') {
          _this.setData({ showMap: false })
          wx.getImageInfo({
            src: tempFilePaths[0],
            success: (imageInfo => {
              _this.drawImage(imageInfo, tempFilePaths[0])
            })
          })
        }
      }
    })
  },
  drawMask: function (decodedMask, cas) {
    const _this = this
    this.setData({ err: 'drawmask' })
    const w = decodedMask[0].length;
    const h = decodedMask.length;
    const uint = new Uint8ClampedArray(w * h * 4);
    const fill = [71, 118, 241, 102]; // rgba
  
    for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
            const data = decodedMask[y][x] ? fill : [0, 0, 0, 0];
            uint.set(data, x * 4 + y * w * 4);
        }
    }
    wx.canvasPutImageData({
      canvasId: 'canvas2',
      x: 0,
      y: 0,
      width: w,
      height: h,
      data: uint,
      success (res) {
        console.log(res)
        wx.createSelectorQuery().select('#canvas2').fields({ size: true, node: true }).exec(res => {
          const node = res[0].node
          const url = node.toDataURL()
          const image = canvas.createImage()
          image.src = url
          image.onload = function() {
            cas.drawImage(image, 0, 0)
          }
        })
      },
      fail(err) {
        _this.setData({ err: err.errMsg })
      }
    }, _this)
  },
  drawImage: function (imageInfo, path) {
    const _this = this
    const { width, height, orientation } = imageInfo
    const fs = wx.getFileSystemManager()
    wx.createSelectorQuery().select('#canvas').fields({ size: true, node: true }).exec(res => {
      if (res && res[0]) {
        // canvas 的宽高。
        console.log(width, height, res)
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const image = canvas.createImage()
        const w = res[0].width // 300 * _this.data.pixelRatio
        const h = res[0].height // 150 * _this.data.pixelRatio
        _this.setData({ err: `w: ${w}, h: ${h}` })
        image.src = path
        image.onload = () => {
          let maxWidth = 0
          let maxHeight = 0
          let left = 0
          let top = 0
          if ((width / height) > (w / h)) {
            // 图片更宽
            maxWidth = w
            maxHeight = height * maxWidth / width
            top = (h - maxHeight) / 2
          } else {
            // 图片更高
            maxHeight = h
            maxWidth = width * maxHeight / height
            left = (w - maxWidth) / 2
          }
          ctx.drawImage(image, 0, 0, width, height, left, top, maxWidth, maxHeight)
          const base64 = canvas.toDataURL().slice('data:image/png;base64,'.length)
          wx.request({
            url: `https://aip.baidubce.com/rpc/2.0/ai_custom/v1/segmentation/hbtest?access_token=${_this.data.access_token}`,
            method: 'POST',
            data: {
              image: base64,
              threshold: 0.1
            },
            success: ({ data }) => {
              if (data && data.results && data.results.length > 0) {
                data.results.forEach(res => {
                  let mask = decodeMask(res.mask, _this.data.canvasHeight)
                  _this.drawMask(mask, ctx)
                })
              }
            },
            fail(err) {
              console.log(err)
            }
          })
        }
      }
    })
  },
  onLoad: function () {
    const _this = this
    wx.getSystemInfo({
      success: (result) => {
        const { pixelRatio, windowWidth, windowHeight} = result
        _this.setData({ canvasWidth: windowWidth, canvasHeight: windowWidth / 2, pixelRatio })
      },
    })
    wx.getLocation({
      type: 'wgs84',
      success({ longitude, latitude }) {
        _this.setData({
          longitude,
          latitude,
          markers: [{
              iconPath: './circle.png',
              width: 100,
              height: 60,
              longitude,
              latitude,
              rotate: 0
          }]
        })
      }
    })
    wx.startLocationUpdate({
      success(data) {
        wx.onLocationChange(({ longitude, latitude }) => {
          _this.setData({ longitude, latitude })
        })
      }
    })
    wx.startDeviceMotionListening({
      interval: 'normal',
      success() {
        wx.onDeviceMotionChange(({ alpha, beta, gamma }) => {
          // alpha 是水平
          // x轴 -
          // y轴 |
          if (_this.data.zoom === 16) {
            return
          }
          _this.setData({
            markers: [
              {
                iconPath: './circle.png',
                width: 100,
                height: 60,
                longitude: _this.data.longitude,
                latitude: _this.data.latitude,
                rotate: 270 - alpha
              }
            ]
          })
        })
      }
    })
    wx.request({
      url: 'https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=2BkkF5nqCeaXrrYA46FsaLvK&client_secret=b9rqExEdk56Q34I9RsOBo5uX1U3MXgIb',
      method: 'GET',
      success: (res) => {
        this.setData({ access_token: res.data.access_token })
      }
    })
  },
})
