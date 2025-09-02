# Signal K Utilities
This project contains some utilities to be used in the development of signalK plugins. The utilities mainly deal with getting data from the signalK server, processing this data and sending it back to the server for further use.

## the MessageHandler class
This is the core class for getting from the signalK server and sending it back.
The MessageHandler can deal with exactly one path. It can be used to get a delta value from the server once it comes available and to send a modified or newly generated value back to the server.

## the MassageHandlerDamped class 
This class is used to calculate a moving average from a delta. It samples its data upon request from the MessageHandler class.

## the Polar class 
The class combines two MessageHandler classes using two paths that together contain a vector value (in polar format). For example Speed over Ground and Cource over Ground. In addition to getting data from and sending data to the server the class has also methods to perform calculations with vectors, lika adding two vectors or rotating a vector.

## the MassageHandlerDamped class
This class is used to calculate a moving average of a vector. It uses a Polar object as a source for its data. The class does not allow to perform calculations with the data. This can only be done with the Polr class.

## typical use case