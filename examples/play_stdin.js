var airtunes = require('../lib/'),
    child_process = require('child_process'),
    argv = require('optimist')
      .usage('Usage: $0 --host [host] --port [num] --volume [num] --password [string]')
      .default('host', 'localhost')
      .default('port', 5000)
      .default('volume', 50)
      .demand(['host'])
      .argv,
      config = require('../lib/config.js');

console.log('pipe PCM data to play over AirTunes');
console.log('example: cat sample.pcm | node play_stdin.js --host <AirTunes host>\n');

var shairport =
  child_process.exec('/home/mafi/shairport/shairport -o pipe ' +
    '/home/mafi/node_airtunes/examples/rawpcm.pcm',
    function (error, stdout, stderr) {
      if (error) {
        console.log(error.stack);
        console.log('Error code: '+error.code);
        console.log('Signal received: '+error.signal);
      }
      console.log('stdout: ' + stdout);
      console.log('stderr: ' + stderr);
  });

shairport.on('exit', function (code) {
  console.log('Child process exited with exit code '+code);
});


var hosts = argv.host.split(' ');
var devices = {};

// process event handlers
process.stdin.on('data', function () {
});

process.stdin.on('error', function () {
});

process.stdin.pipe(airtunes);
process.stdin.resume();

hosts.forEach(function(host) {
  devices[host] = airtunes.add(host, argv);
  console.log('adding device: ' + host + ':' + argv.port);
});

airtunes.on('drain', function(e) {});

// monitor buffer events
airtunes.on('buffer', function(status) {
  console.log('buffer ' + status);
  if(status === 'end') {}
});

process.on('exit', function(code) {
  shairport.kill();
})
