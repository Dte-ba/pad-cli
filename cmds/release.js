/* release commander component
 * To use add require('../cmds/release.js')(program) to your commander.js based node executable before program.parse
 */
'use strict';

module.exports = function(program) {

	program
		.command('release')
		.version('1.0.0')
		.description('Crear un nuevo release del PAD')
		.action(function(/* Args here */){
			// Your code goes here
		});
	
};