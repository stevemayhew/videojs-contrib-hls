/**
 * Created by smayhew on 1/30/15.
 */

var path = require('path'),
    fs = require('fs');

// TODO: A Longer task, make videoJs 'require' friendly, using modules and exports to breakup
// the bits that depend on 'document' and other DOM specific code.  These next two lines
// get us enough to run the segment parsers (for now)
//
window = {};

// Since videoJs module implementation is not require/exports friendly working it into nodeJs takes
// some hacking, order the requires statisfy matters here.  TODO: follow factory pattern from http://tinyurl.com/cvjkgnk
//
var flvTag = require('../../../src/flv-tag.js');
exports.videojs = flvTag.videojs;        // hack the 'exports' over
exports.videojs.log = console.log;
require('../../../src/aac-stream.js');
require('../../../src/exp-golomb.js');
require('../../../src/h264-stream.js');
require('../../../src/segment-parser.js');

var inFile, outFile, args = process.argv.slice(2);

if (args.length < 1) {
    console.log("Usage 'node tsToFLV.js <transport stream file> [out FLV file name]'");
    process.exit(1);
} else {
    inFile = args[0];

    var dir = path.dirname(inFile),
        baseName = path.basename(inFile, '.ts');
        outFileName = args.length > 1 ? args[1] : baseName + '.flv';
    outFile = path.join(dir, outFileName);
}

fs.readFile(inFile, function (err, dataIn) {
    if (err) {
        throw err;
    }

    var parser = new exports.videojs.Hls.SegmentParser(),
        tags = [],
        tag,
        header,
        bytes,
        li,
        byteLength = 0,
        data,
        i,
        pos;

    bytes = new Uint8Array(dataIn);
    parser.parseSegmentBinaryData(bytes);
    header = parser.getFlvHeader();
    byteLength += header.byteLength;

    // collect all the tags
    while (parser.tagsAvailable()) {
        tag = parser.getNextTag();
        tags.push(tag);
    }

    // TODO - investigate, sorting seems to help, real issue is the out of order timestamps
    tags.sort(function compare(a, b) {
        var result = a.pts - b.pts;
        if (result == 0) {

            // In the case of a tie, send Audio or Metadata first
            var typeA = a.bytes[0];
            switch(typeA) {
                case exports.videojs.Hls.FlvTag.VIDEO_TAG:
                    result = -1;  // Audio first
                    break;
                case exports.videojs.Hls.FlvTag.METADATA_TAG:
                case exports.videojs.Hls.FlvTag.AUDIO_TAG:
                    result = 1;  // Audio first
                    break;
                default:
                    break;
            }
        }
        return result;
    });

    for (i=0; i<tags.length; i++) {
        tag = tags[i];
        var tagData = tag.bytes;
        switch(tagData[0]) {
            case exports.videojs.Hls.FlvTag.VIDEO_TAG:
                console.log(i+" video "+tags[i].bytes.byteLength+" ");
                break;
            case exports.videojs.Hls.FlvTag.METADATA_TAG:
                console.log(i+" metadata "+tags[i].bytes.byteLength+" ");
                break;
            case exports.videojs.Hls.FlvTag.AUDIO_TAG:
                console.log(i+" audio "+tags[i].bytes.byteLength+"");
                break;
            default:
                break;

        }
    }
    // create a uint8array for the entire segment and copy everything over
    i = tags.length;
    while (i--) {
        byteLength += tags[i].bytes.byteLength;
    }

    data = new Uint8Array(byteLength);
    i = tags.length;
    pos = byteLength;
    while (i--) {
        pos -= tags[i].bytes.byteLength;
        data.set(tags[i].bytes, pos);
    }
    pos -= header.bytesLength;
    data.set(header, pos);

    console.log(data.length);

    fs.writeFile(outFile, new Buffer(data), function (err) {
      if (err) {
          throw err;
      }
      console.log("Saved output FLV file '" + outFile + "'");
    });
});
